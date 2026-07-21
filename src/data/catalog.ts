import { chapters } from './chapters';

export type CatalogType = 'Chapter guide' | 'Application example' | 'Portal page' | 'Update';

export interface CatalogItem {
  id: string;
  title: string;
  description: string;
  type: CatalogType;
  href: string;
  chapter?: number;
  chapterTitle?: string;
  tags: string[];
}

const slugify = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const chapterGuides: CatalogItem[] = chapters.map((chapter) => ({
  id: `chapter-${chapter.number}`,
  title: `Chapter ${chapter.number}: ${chapter.title}`,
  description: chapter.summary,
  type: 'Chapter guide',
  href: `/chapters/${chapter.slug}`,
  chapter: chapter.number,
  chapterTitle: chapter.title,
  tags: chapter.topics,
}));

const examples: CatalogItem[] = chapters.flatMap((chapter) => chapter.applicationExamples.map((example) => ({
  id: `chapter-${chapter.number}-${slugify(example)}`,
  title: example,
  description: `An engineering example catalogued in Chapter ${chapter.number}, ${chapter.title}.`,
  type: 'Application example' as const,
  href: `/application-examples?chapter=${chapter.number}`,
  chapter: chapter.number,
  chapterTitle: chapter.title,
  tags: [...chapter.topics, 'Application Example'],
})));

const portalPages: CatalogItem[] = [
  {
    id: 'application-examples',
    title: 'Application Example notebooks',
    description: 'Browse 56 executable engineering machine learning notebooks with direct GitHub and Google Colab access.',
    type: 'Portal page',
    href: '/application-examples',
    tags: ['Application Examples', 'Python', 'Notebooks', 'Google Colab'],
  },
  {
    id: 'book-overview',
    title: 'About the book',
    description: 'Audience, pedagogical approach, structure, and ordering information for Machine Learning for Engineering Applications.',
    type: 'Portal page',
    href: '/book',
    tags: ['Book', 'Overview', 'Purchase'],
  },
  {
    id: 'author-profile',
    title: 'About the author: Yan Jin',
    description: 'Biography, research interests, selected distinctions, and professional service of ML4EA author Yan Jin.',
    type: 'Portal page',
    href: '/author',
    tags: ['Author', 'Yan Jin', 'USC', 'IMPACT Lab'],
  },
  {
    id: 'learning-pathways',
    title: 'Learning pathways',
    description: 'Navigate the book from mathematical foundations to complete engineering systems.',
    type: 'Portal page',
    href: '/learn',
    tags: ['Students', 'Background', 'Chapters'],
  },
  {
    id: 'instructor-overview',
    title: 'Teaching with ML4EA',
    description: 'Public overview of course pathways, teaching principles, and verified instructor resources.',
    type: 'Portal page',
    href: '/teach',
    tags: ['Instructors', 'Teaching', 'Course design'],
  },
  {
    id: 'community-overview',
    title: 'ML4EA community',
    description: 'How readers, students, engineers, and instructors will discuss and contribute to the portal.',
    type: 'Portal page',
    href: '/community',
    tags: ['Community', 'Contributions', 'Discussion'],
  },
  {
    id: 'errata',
    title: 'Book errata',
    description: 'Verified corrections and clarifications organized by chapter and location.',
    type: 'Portal page',
    href: '/updates/errata',
    tags: ['Errata', 'Corrections', 'Updates'],
  },
];

const updates: CatalogItem[] = [
  {
    id: 'update-public-portal',
    title: 'Public companion portal launched',
    description: 'The ML4EA book overview, chapter directory, resource catalog, updates, and search are now available.',
    type: 'Update',
    href: '/updates#public-portal-launch',
    tags: ['Portal', 'Launch'],
  },
];

export const catalogItems: CatalogItem[] = [...chapterGuides, ...examples, ...portalPages, ...updates];
export const resourceItems: CatalogItem[] = [...chapterGuides, ...examples];
