import './SkillChip.css';

const SKILL_SOURCE_LABELS = {
  candidate_profile: 'self-declared',
  resume: 'resume',
  assessment: 'assessment',
  project: 'project',
  mentor_observation: 'mentor-observed',
};

/**
 * Skill chip vocabulary (evidence-aware, per product rules):
 *  - 'declared'   → self-declared by the candidate
 *  - 'observed'   → mentor-observed (stronger evidence)
 *  - 'matched'    → required by internship AND present on the candidate
 *  - 'gap'        → required by internship, no declaration on file.
 *                   Careful language: a gap is "not listed", never "cannot".
 *  - 'neutral'    → plain required-skills listing
 */
export default function SkillChip({ name, variant = 'neutral', source, title }) {
  const cls = `skill-chip-base skill-chip--${variant}`;
  const tooltip = title
    || (variant === 'gap' && `${name} — no declaration on file yet (potential gap, not a disqualification)`)
    || (variant === 'matched' && `${name} — matches a required skill`)
    || (variant === 'observed' && `${name} — mentor-observed`)
    || (variant === 'declared' && `${name} — self-declared`)
    || name;

  return (
    <span className={cls} title={tooltip}>
      {variant === 'matched' && <span className="skill-chip-mark" aria-hidden="true">✓</span>}
      {variant === 'gap' && <span className="skill-chip-mark" aria-hidden="true">○</span>}
      <span>{name}</span>
      {source && <span className="skill-chip-source">{source}</span>}
    </span>
  );
}

export function SkillList({ skills = [], variant = 'neutral', emptyText = 'No skills listed yet.', sourceMap }) {
  if (!skills.length) {
    return <p className="skill-list-empty">{emptyText}</p>;
  }
  return (
    <div className="skill-list-row">
      {skills.map((skill) => {
        const name = typeof skill === 'string' ? skill : skill.name;
        const source = typeof skill === 'string' ? undefined : skill.source;
        return (
          <SkillChip
            key={skill.id ?? name}
            name={name}
            variant={variant === 'auto' && source === 'mentor_observation' ? 'observed' : variant}
            source={source && sourceMap ? SKILL_SOURCE_LABELS[source] : undefined}
          />
        );
      })}
    </div>
  );
}
