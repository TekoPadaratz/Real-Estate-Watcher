import { readFile } from "node:fs/promises";
import YAML from "yaml";

export async function loadYamlFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return YAML.parse(raw) as T;
}
