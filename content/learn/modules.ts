/** One explicit dynamic import per available unit; verified against disk and curriculum. */
export const learnModules: Readonly<Record<string, () => Promise<{ default: unknown }>>> = {
  'course-1/1.1': () => import('./course-1/1.1'),
  'course-1/1.2': () => import('./course-1/1.2'),
  'course-1/1.3': () => import('./course-1/1.3'),
  'course-1/1.4': () => import('./course-1/1.4'),
  'course-1/1.5': () => import('./course-1/1.5'),
  'course-1/1.6': () => import('./course-1/1.6'),
  'course-1/1.7': () => import('./course-1/1.7'),
  'course-1/1.8': () => import('./course-1/1.8')
};
