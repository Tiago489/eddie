export interface MockQueue {
  add: (name: string, data: unknown) => Promise<void>;
  jobs: Array<{ name: string; data: unknown }>;
}

export function createMockQueue(): MockQueue {
  const jobs: Array<{ name: string; data: unknown }> = [];
  return {
    jobs,
    add: async (name, data) => {
      jobs.push({ name, data });
    },
  };
}
