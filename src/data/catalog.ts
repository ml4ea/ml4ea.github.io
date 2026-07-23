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
    description: 'Preview a catalog of 56 validated engineering machine learning notebooks while distribution undergoes publisher review.',
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
    id: 'instructor-workspace',
    title: 'Instructor workspace',
    description: 'Apply for verified instructor access and securely obtain protected ML4EA teaching resources.',
    type: 'Portal page',
    href: '/instructor',
    tags: ['Instructors', 'Verification', 'Protected resources', 'Account'],
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
    id: 'contribute',
    title: 'Contribute to ML4EA',
    description: 'Report corrections and propose teaching resources; notebook contribution intake will open after publisher review.',
    type: 'Portal page',
    href: '/contribute',
    tags: ['Contribute', 'Corrections', 'GitHub', 'Application Examples'],
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
    id: 'update-prelaunch-review',
    title: 'Portal entered prelaunch review',
    description: 'The portal is available as a no-index preview while Application Example distribution and release language are reviewed.',
    type: 'Update',
    href: '/updates#prelaunch-review',
    tags: ['Portal', 'Prelaunch', 'Publisher review'],
  },
  {
    id: 'update-preview-prepared',
    title: 'Companion portal preview prepared',
    description: 'The ML4EA book overview, chapter directory, resource catalog, teaching workspace, updates, and search are ready for review.',
    type: 'Update',
    href: '/updates#preview-prepared',
    tags: ['Portal', 'Preview'],
  },
];

export const catalogItems: CatalogItem[] = [...chapterGuides, ...examples, ...portalPages, ...updates];
export const resourceItems: CatalogItem[] = [...chapterGuides, ...examples];
