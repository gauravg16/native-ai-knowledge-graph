"use client";

import { OrgSummary } from "../lib/types";

interface OrgSelectorProps {
  organizations: OrgSummary[];
  selectedId: string | null;
  onChange: (orgId: string) => void;
}

export default function OrgSelector({
  organizations,
  selectedId,
  onChange,
}: OrgSelectorProps) {
  return (
    <select
      value={selectedId || ""}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-800 text-slate-200 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      style={{ backgroundColor: '#1e293b', color: '#e2e8f0', borderColor: '#475569' }}
    >
      <option value="" disabled>
        Select organization...
      </option>
      {organizations.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name} ({org.total.toLocaleString()} nodes)
        </option>
      ))}
    </select>
  );
}
