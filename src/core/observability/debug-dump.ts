import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export class DebugDumpService {
  constructor(private readonly baseDir: string) {}

  async writeText(kind: string, sourceId: string, name: string, content: string): Promise<string> {
    const filePath = join(this.baseDir, sanitizeSegment(sourceId), `${sanitizeSegment(kind)}-${sanitizeSegment(name)}.txt`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
    return filePath;
  }

  async writeHtml(sourceId: string, name: string, content: string): Promise<string> {
    const filePath = join(this.baseDir, sanitizeSegment(sourceId), `${sanitizeSegment(name)}.html`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
    return filePath;
  }

  async writeJson(sourceId: string, name: string, payload: unknown): Promise<string> {
    const filePath = join(this.baseDir, sanitizeSegment(sourceId), `${sanitizeSegment(name)}.json`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return filePath;
  }

  async writeBuffer(sourceId: string, name: string, buffer: Buffer, extension: string): Promise<string> {
    const filePath = join(this.baseDir, sanitizeSegment(sourceId), `${sanitizeSegment(name)}.${extension}`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return filePath;
  }
}
