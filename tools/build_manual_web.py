#!/usr/bin/env python3
"""Convert the ML4EA instructor manual LaTeX into trusted web sections.

The generated content is private deployment material. Write it only to an
ignored directory or a temporary path; never commit it to the public portal.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path


BOOK_TITLE = "Machine Learning for Engineering Applications"
MANUAL_TITLE = "Instructor's Manual"
EDITION_SLUG = "2026-07"

CALLOUTS = {
    "manualnote": ("Instructor note", "note"),
    "teachingtip": ("Teaching tip", "tip"),
    "learningobjectivesbox": ("Learning objectives", "objectives"),
    "misconceptionsbox": ("Common student difficulties / misconceptions", "misconceptions"),
    "aebox": ("Application Example guidance", "ae"),
    "assessmentbox": ("Assessment ideas", "assessment"),
    "discussionbox": ("Discussion questions", "discussion"),
}


@dataclass
class ManualSection:
    slug: str
    chapter_number: int
    chapter_title: str
    title: str
    kind: str
    sort_order: int
    body_html: str
    search_text: str


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")


def strip_comments(text: str) -> str:
    return re.sub(r"(?<!\\)%.*$", "", text, flags=re.MULTILINE)


def extract_braced(text: str, brace_index: int) -> tuple[str, int]:
    if brace_index >= len(text) or text[brace_index] != "{":
        raise ValueError(f"Expected opening brace at {brace_index}")
    depth = 0
    escaped = False
    for index in range(brace_index, len(text)):
        char = text[index]
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[brace_index + 1:index], index + 1
    raise ValueError("Unclosed brace group")


def command_argument(text: str, start: int, command: str) -> tuple[str, int]:
    index = start + len(command)
    if index < len(text) and text[index] == "*":
        index += 1
    while index < len(text) and text[index].isspace():
        index += 1
    return extract_braced(text, index)


def inline_tex(text: str) -> str:
    output: list[str] = []
    index = 0
    command_tags = {
        "\\textbf": "strong",
        "\\textit": "em",
        "\\emph": "em",
        "\\texttt": "code",
        "\\underline": "span",
    }
    ignored_commands = {
        "small", "normalsize", "noindent", "smallskip", "medskip", "bigskip",
        "pagebreak", "clearpage", "newpage", "hfill", "vfill", "raggedright",
    }

    while index < len(text):
        if text.startswith("\\booktitle", index):
            output.append(f"<em>{html.escape(BOOK_TITLE)}</em>")
            index += len("\\booktitle")
            continue
        if text.startswith("\\manualtitle", index):
            output.append(f"<em>{html.escape(MANUAL_TITLE)}</em>")
            index += len("\\manualtitle")
            continue

        matched = False
        for command, tag in command_tags.items():
            if text.startswith(command, index):
                argument, end = command_argument(text, index, command)
                css = ' class="manual-underline"' if command == "\\underline" else ""
                output.append(f"<{tag}{css}>{inline_tex(argument)}</{tag}>")
                index = end
                matched = True
                break
        if matched:
            continue

        if text.startswith("\\href", index):
            url, next_index = command_argument(text, index, "\\href")
            label, end = extract_braced(text, next_index)
            safe_url = html.escape(url.strip(), quote=True)
            output.append(f'<a href="{safe_url}" target="_blank" rel="noreferrer">{inline_tex(label)}</a>')
            index = end
            continue
        if text.startswith("\\url", index):
            url, end = command_argument(text, index, "\\url")
            safe_url = html.escape(url.strip(), quote=True)
            output.append(f'<a href="{safe_url}" target="_blank" rel="noreferrer">{safe_url}</a>')
            index = end
            continue

        if text[index] == "$":
            end = text.find("$", index + 1)
            if end != -1:
                math = text[index + 1:end].strip()
                math_html = html.escape(math).replace("\\rightarrow", "&rarr;")
                output.append(f'<span class="manual-math">{math_html}</span>')
                index = end + 1
                continue

        if text[index] == "\\":
            if index + 1 < len(text) and text[index + 1] in "%&_#$":
                output.append(html.escape(text[index + 1]))
                index += 2
                continue
            if index + 1 < len(text) and text[index + 1].isspace():
                output.append(" ")
                index += 2
                continue
            command_match = re.match(r"\\([A-Za-z]+)\*?", text[index:])
            if command_match:
                command_name = command_match.group(1)
                end = index + len(command_match.group(0))
                if command_name in ignored_commands:
                    index = end
                    continue
                probe = end
                while probe < len(text) and text[probe].isspace():
                    probe += 1
                if probe < len(text) and text[probe] == "{":
                    argument, group_end = extract_braced(text, probe)
                    output.append(inline_tex(argument))
                    index = group_end
                    continue
                index = end
                continue
            if index + 1 < len(text) and text[index + 1] == "\\":
                output.append("<br>")
                index += 2
                continue

        if text.startswith("``", index):
            output.append("&ldquo;")
            index += 2
        elif text.startswith("''", index):
            output.append("&rdquo;")
            index += 2
        elif text.startswith("---", index):
            output.append("&mdash;")
            index += 3
        elif text.startswith("--", index):
            output.append("&ndash;")
            index += 2
        elif text[index] == "~":
            output.append("&nbsp;")
            index += 1
        else:
            output.append(html.escape(text[index]))
            index += 1

    return "".join(output)


class BlockStore:
    def __init__(self) -> None:
        self.blocks: dict[str, str] = {}

    def add(self, value: str) -> str:
        token = f"ZZZMLBLOCK{len(self.blocks):05d}ZZZ"
        self.blocks[token] = value
        return f"\n\n{token}\n\n"

    def restore(self, value: str) -> str:
        for token, block in self.blocks.items():
            value = value.replace(token, block)
        return value


def split_items(content: str) -> list[str]:
    positions = [match.start() for match in re.finditer(r"\\item(?:\s|$)", content)]
    if not positions:
        return [content]
    items: list[str] = []
    for offset, start in enumerate(positions):
        item_start = re.match(r"\\item(?:\s|$)", content[start:]).end() + start
        item_end = positions[offset + 1] if offset + 1 < len(positions) else len(content)
        items.append(content[item_start:item_end].strip())
    return items


def render_table(content: str) -> str:
    content = content.strip()
    if content.startswith("{"):
        _, end = extract_braced(content, 0)
        content = content[end:]
    content = re.sub(r"\\(toprule|midrule|bottomrule)", "", content)
    rows = [row.strip() for row in re.split(r"\\\\", content) if row.strip()]
    rendered_rows: list[str] = []
    for row_index, row in enumerate(rows):
        cells = [inline_tex(cell.strip()) for cell in re.split(r"(?<!\\)&", row)]
        tag = "th" if row_index == 0 else "td"
        rendered_rows.append("<tr>" + "".join(f"<{tag}>{cell}</{tag}>" for cell in cells) + "</tr>")
    if not rendered_rows:
        return ""
    return f'<div class="manual-table-wrap"><table><thead>{rendered_rows[0]}</thead><tbody>{"".join(rendered_rows[1:])}</tbody></table></div>'


def replace_syllabus_weeks(text: str, store: BlockStore) -> str:
    command = "\\syllabusweek"
    while command in text:
        start = text.index(command)
        index = start + len(command)
        arguments: list[str] = []
        for _ in range(4):
            while index < len(text) and text[index].isspace():
                index += 1
            argument, index = extract_braced(text, index)
            arguments.append(argument)
        week, title, left, right = arguments
        block = (
            '<section class="manual-week">'
            f'<header><span>Week {inline_tex(week)}</span><h4>{inline_tex(title)}</h4></header>'
            f'<div class="manual-week-grid"><div>{render_tex(left)}</div><div>{render_tex(right)}</div></div>'
            '</section>'
        )
        text = text[:start] + store.add(block) + text[index:]
    return text


def replace_environments(text: str, store: BlockStore) -> str:
    environment_names = list(CALLOUTS) + ["itemize", "enumerate", "quote", "center", "tabular"]
    pattern = re.compile(r"\\begin\{(" + "|".join(environment_names) + r")\}(.*?)\\end\{\1\}", re.DOTALL)
    while True:
        match = pattern.search(text)
        if not match:
            return text
        environment, content = match.group(1), match.group(2).strip()
        content = re.sub(r"^\[[^\]]*\]", "", content).strip()
        if environment in ("itemize", "enumerate"):
            tag = "ul" if environment == "itemize" else "ol"
            items = "".join(f"<li>{render_tex(item, compact=True)}</li>" for item in split_items(content))
            block = f"<{tag}>{items}</{tag}>"
        elif environment in CALLOUTS:
            title, style = CALLOUTS[environment]
            block = f'<aside class="manual-callout manual-callout--{style}"><h4>{title}</h4>{render_tex(content)}</aside>'
        elif environment == "quote":
            block = f"<blockquote>{render_tex(content)}</blockquote>"
        elif environment == "center":
            block = f'<div class="manual-centered">{render_tex(content)}</div>'
        else:
            block = render_table(content)
        text = text[:match.start()] + store.add(block) + text[match.end():]


def replace_headings(text: str, store: BlockStore) -> str:
    heading_commands = [("subsubsection", "h4"), ("subsection", "h3")]
    for command_name, tag in heading_commands:
        pattern = re.compile(rf"\\{command_name}\*?\{{")
        while True:
            match = pattern.search(text)
            if not match:
                break
            title, end = extract_braced(text, match.end() - 1)
            plain_title = re.sub(r"<[^>]+>", "", inline_tex(title))
            anchor = slugify(html.unescape(plain_title))
            block = f'<{tag} id="{anchor}">{inline_tex(title)}</{tag}>'
            text = text[:match.start()] + store.add(block) + text[end:]

    command = "\\syllabuslabel"
    while command in text:
        start = text.index(command)
        title, end = command_argument(text, start, command)
        text = text[:start] + store.add(f"<h5>{inline_tex(title)}</h5>") + text[end:]
    return text


def clean_layout_commands(text: str) -> str:
    text = re.sub(r"\\addcontentsline\{[^}]*\}\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\(?:vspace|enlargethispage|setstretch)\*?\{[^}]*\}", "", text)
    text = re.sub(r"\\rule\{[^}]*\}\{[^}]*\}", "", text)
    text = re.sub(r"\\begin\{minipage\}(?:\[[^\]]*\])?\{[^}]*\}", "", text)
    text = re.sub(r"\\end\{minipage\}", "", text)
    text = re.sub(r"\\(?:pagebreak|clearpage|newpage)(?:\[[^\]]*\])?", "", text)
    text = re.sub(r"\\(?:smallskip|medskip|bigskip|noindent|small|normalsize|hfill|vfill)\b", "", text)
    text = re.sub(r"\\centerline\{(.*?)\}", r"\1", text, flags=re.DOTALL)
    return text


def render_tex(source: str, compact: bool = False) -> str:
    text = strip_comments(source)
    definition_start = text.find("\\newcommand{\\syllabuslabel}")
    if definition_start != -1:
        definition_end = text.find("\\subsubsection{Sample 15--Week Syllabus}", definition_start)
        if definition_end != -1:
            text = text[:definition_start] + text[definition_end:]

    store = BlockStore()
    text = replace_syllabus_weeks(text, store)
    text = replace_environments(text, store)
    text = replace_headings(text, store)
    text = clean_layout_commands(text)

    paragraphs: list[str] = []
    for chunk in re.split(r"\n\s*\n", text):
        chunk = " ".join(line.strip() for line in chunk.strip().splitlines() if line.strip())
        if not chunk:
            continue
        if chunk in store.blocks:
            paragraphs.append(chunk)
        else:
            rendered = inline_tex(chunk).strip()
            if rendered:
                paragraphs.append(rendered if compact else f"<p>{rendered}</p>")
    return store.restore("".join(paragraphs))


def plain_text(body_html: str) -> str:
    value = re.sub(r"<[^>]+>", " ", body_html)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def section_commands(text: str) -> list[tuple[int, int, str]]:
    sections: list[tuple[int, int, str]] = []
    for match in re.finditer(r"\\section\*?\{", text):
        title, end = extract_braced(text, match.end() - 1)
        sections.append((match.start(), end, title))
    return sections


def chapter_title(text: str) -> tuple[str, int]:
    match = re.search(r"\\chapter\*?\{", text)
    if not match:
        raise ValueError("Chapter title not found")
    title, end = extract_braced(text, match.end() - 1)
    return title, end


def add_section(
    sections: list[ManualSection],
    chapter_number: int,
    chapter_name: str,
    title: str,
    kind: str,
    body_source: str,
) -> None:
    body = render_tex(body_source)
    if not plain_text(body):
        return
    prefix = "getting-started" if chapter_number == 0 else f"chapter-{chapter_number}"
    slug = f"{prefix}-{slugify(title)}"
    sections.append(ManualSection(
        slug=slug,
        chapter_number=chapter_number,
        chapter_title=chapter_name,
        title=title,
        kind=kind,
        sort_order=len(sections) + 1,
        body_html=body,
        search_text=plain_text(body),
    ))


def build_sections(manual_dir: Path) -> list[ManualSection]:
    sections: list[ManualSection] = []
    main_text = (manual_dir / "main.tex").read_text(encoding="utf-8")
    preface_start = main_text.index("\\chapter*{Preface}")
    use_start = main_text.index("\\chapter*{How to Use This Manual}")
    mainmatter = main_text.index("\\mainmatter")
    preface_body = main_text[main_text.index("\n", preface_start):use_start]
    use_body = main_text[main_text.index("\n", use_start):mainmatter]
    add_section(sections, 0, "Getting started", "Preface", "frontmatter", preface_body)
    add_section(sections, 0, "Getting started", "How to use this manual", "frontmatter", use_body)

    chapter_files = [
        "1-overview.tex",
        "2-course design.tex",
        "3-general advice.tex",
        "4-using AEs.tex",
        "5-chap-by-chap notes.tex",
        "6-assessment-guide.tex",
        "7-resources.tex",
    ]
    for chapter_number, filename in enumerate(chapter_files, start=1):
        text = (manual_dir / filename).read_text(encoding="utf-8")
        title, chapter_end = chapter_title(text)
        commands = section_commands(text)
        intro_end = commands[0][0] if commands else len(text)
        intro = text[chapter_end:intro_end]
        if plain_text(render_tex(intro)):
            add_section(sections, chapter_number, title, title, "chapter", intro)
        for offset, (start, body_start, section_title) in enumerate(commands):
            body_end = commands[offset + 1][0] if offset + 1 < len(commands) else len(text)
            add_section(sections, chapter_number, title, section_title, "section", text[body_start:body_end])
    return sections


def dollar_quote(value: str) -> str:
    tag = "ml4ea_manual"
    if f"${tag}$" in value:
        raise ValueError("Unexpected SQL dollar-quote marker in manual content")
    return f"${tag}${value}${tag}$"


def write_sql(path: Path, sections: list[ManualSection]) -> None:
    values: list[str] = []
    for section in sections:
        values.append("(" + ", ".join([
            dollar_quote(EDITION_SLUG),
            dollar_quote(section.slug),
            str(section.chapter_number),
            dollar_quote(section.chapter_title),
            dollar_quote(section.title),
            dollar_quote(section.kind),
            str(section.sort_order),
            dollar_quote(section.body_html),
            dollar_quote(section.search_text),
        ]) + ")")
    value_rows = ",\n  ".join(values)
    sql = f"""begin;

insert into public.instructor_manual_editions (
  slug, title, version_label, published_on, pdf_storage_path, is_current, usage_notice
) values (
  '{EDITION_SLUG}',
  'Instructor''s Manual for Machine Learning for Engineering Applications',
  'July 2026',
  '2026-07-20',
  'manual/ML4EA-Instructors-Manual-2026-07.pdf',
  true,
  'For verified instructors evaluating or teaching with Machine Learning for Engineering Applications. Do not redistribute the complete manual publicly.'
)
on conflict (slug) do update set
  title = excluded.title,
  version_label = excluded.version_label,
  published_on = excluded.published_on,
  pdf_storage_path = excluded.pdf_storage_path,
  is_current = excluded.is_current,
  usage_notice = excluded.usage_notice;

delete from public.instructor_manual_sections
where edition_id = (select id from public.instructor_manual_editions where slug = '{EDITION_SLUG}');

insert into public.instructor_manual_sections (
  edition_id, slug, chapter_number, chapter_title, title, kind,
  sort_order, body_html, search_text
)
select edition.id, source.slug, source.chapter_number, source.chapter_title,
       source.title, source.kind, source.sort_order, source.body_html, source.search_text
from public.instructor_manual_editions edition
cross join (values
  {value_rows}
) as source(edition_slug, slug, chapter_number, chapter_title, title, kind, sort_order, body_html, search_text)
where edition.slug = source.edition_slug;

commit;
"""
    path.write_text(sql, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True, help="Path to the finalized Manual directory")
    parser.add_argument("--output", type=Path, required=True, help="Private JSON output path")
    parser.add_argument("--sql-output", type=Path, help="Optional private SQL ingestion output path")
    args = parser.parse_args()

    sections = build_sections(args.source)
    payload = {
        "edition": {
            "slug": EDITION_SLUG,
            "title": "Instructor's Manual for Machine Learning for Engineering Applications",
            "version_label": "July 2026",
            "pdf_storage_path": "manual/ML4EA-Instructors-Manual-2026-07.pdf",
        },
        "sections": [asdict(section) for section in sections],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    if args.sql_output:
        args.sql_output.parent.mkdir(parents=True, exist_ok=True)
        write_sql(args.sql_output, sections)
    print(f"Generated {len(sections)} protected manual sections.")


if __name__ == "__main__":
    main()
