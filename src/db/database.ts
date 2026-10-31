import Dexie, { type Table } from 'dexie';
import type { Instructions } from '../engine/types';

export interface Project {
  id: string;
  name: string;
  instructions: Instructions;
  updatedAt: number;
}

class AppDB extends Dexie {
  projects!: Table<Project, string>;
  constructor() {
    super('tadreeb-agenda');
    this.version(1).stores({ projects: 'id, updatedAt' });
  }
}
export const db = new AppDB();

export const listProjects = () => db.projects.orderBy('updatedAt').reverse().toArray();
export const saveProject = (p: Project) => db.projects.put({ ...p, updatedAt: Date.now() });
export const removeProject = (id: string) => db.projects.delete(id);

export const exportJson = (i: Instructions) => JSON.stringify({ format: 'tadreeb-instructions', version: 1, instructions: i }, null, 2);
export function importJson(text: string): Instructions {
  const j = JSON.parse(text);
  const i = j.instructions ?? j;
  if (!i || typeof i.startSaturday !== 'string' || !Array.isArray(i.weeksPerMonth)) throw new Error('ملف غير صالح');
  return i as Instructions;
}
