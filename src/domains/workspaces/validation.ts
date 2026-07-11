import { z } from "zod";

/** Folder/drive display names: no path separators or control characters (spaces OK). */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME = /[/\\\x00-\x1f]/;
export const displayName = z
  .string()
  .min(1)
  .max(255)
  .refine((s) => !UNSAFE_NAME.test(s), "invalid characters in name")
  .refine((s) => s.trim() === s && s !== "." && s !== "..", "invalid name");

export const createFolderSchema = z.object({
  driveId: z.string().uuid(),
  parentFolderId: z.string().uuid().nullable().optional(),
  name: displayName,
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

export const listContentsSchema = z.object({
  driveId: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
});
export type ListContentsInput = z.infer<typeof listContentsSchema>;

/** Build a child's materialised path from its parent (or drive root). */
export function childPath(parentPath: string | null, name: string): string {
  const base = parentPath ?? "/";
  return `${base}${name}/`;
}
