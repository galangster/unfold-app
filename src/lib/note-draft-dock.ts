import { create } from 'zustand';

export type NoteDraftDock = {
  noteId: string;
  title: string;
  preview: string;
  updatedAt: string;
};

type NoteDraftDockState = {
  draft: NoteDraftDock | null;
  setDraft: (draft: NoteDraftDock) => void;
  clearDraft: () => void;
};

export function buildNoteDraftDockPreview({
  title,
  plainText,
}: {
  title: string;
  plainText: string;
}): { title: string; preview: string } {
  const cleanTitle = title.trim();
  const cleanPreview = plainText.replace(/\s+/g, ' ').trim();

  return {
    title: cleanTitle || cleanPreview.slice(0, 42) || 'Untitled note',
    preview: cleanPreview || 'Draft saved — tap to restore.',
  };
}

export const useNoteDraftDock = create<NoteDraftDockState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
