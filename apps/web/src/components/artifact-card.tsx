'use client';
import { FileText } from 'lucide-react';
import { date } from '../api';
import type { Artifact } from '../types';

export function ArtifactCard({ artifact: a }: { artifact: Artifact }) {
  return (
    <article className="artifact-card">
      <FileText size={20} />
      <div>
        <h3>{a.name}</h3>
        <span className="eyebrow">
          {a.artifact_type} · {date(a.created_at)}
        </span>
        {a.content_text &&
          (a.artifact_type === 'text' ? (
            <p className="artifact-text">{a.content_text}</p>
          ) : (
            <pre>{a.content_text}</pre>
          ))}
      </div>
    </article>
  );
}
