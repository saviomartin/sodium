"use client";

import { createContext, useContext, useMemo, useState } from "react";

const RepositorySettingsContext = createContext({
  editPending: false,
  beginEdit: () => {},
  endEdit: () => {},
});

export function RepositorySettingsState({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pendingEdits, setPendingEdits] = useState(0);
  const value = useMemo(
    () => ({
      editPending: pendingEdits > 0,
      beginEdit: () => setPendingEdits((count) => count + 1),
      endEdit: () => setPendingEdits((count) => Math.max(0, count - 1)),
    }),
    [pendingEdits],
  );
  return (
    <RepositorySettingsContext.Provider value={value}>
      {children}
    </RepositorySettingsContext.Provider>
  );
}

export function useRepositorySettingsState() {
  return useContext(RepositorySettingsContext);
}
