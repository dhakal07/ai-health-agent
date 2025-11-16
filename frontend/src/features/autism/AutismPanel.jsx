// frontend/src/features/autism/AutismPanel.jsx
export default function AutismPanel() {
  return (
    <div className="card">
      <h2 className="card-title">Autism Focus (Educational)</h2>
      <p className="muted">
        This section provides general information about autism (ASD). It is not
        a diagnosis. For concerns about yourself or your child, please consult a
        qualified professional.
      </p>

      <details className="blk" open>
        <summary className="sum">What is Autism?</summary>
        <p>
          Autism spectrum disorder (ASD) is a neurodevelopmental difference that
          can affect social communication, sensory processing and behavioral
          preferences. Experiences vary widely from person to person.
        </p>
      </details>

      <details className="blk">
        <summary className="sum">Typical Signs in Children</summary>
        <ul className="bullets">
          <li>Differences in eye contact or social play</li>
          <li>Strong interest in routines or specific topics</li>
          <li>Sensitivities to sound, light, or textures</li>
          <li>Delayed or unusual language patterns</li>
        </ul>
      </details>

      <details className="blk">
        <summary className="sum">Support & Therapy (Examples)</summary>
        <ul className="bullets">
          <li>Parent-guided communication strategies</li>
          <li>Occupational therapy for sensory regulation</li>
          <li>Visual schedules and predictable routines</li>
          <li>Strength-based learning environments</li>
        </ul>
        <p className="muted">
          The right support depends on individual needs. Local clinical teams
          can advise on options available in your area.
        </p>
      </details>

      <details className="blk">
        <summary className="sum">Screening</summary>
        <p>
          Your prototype includes a short 10-item routine/attention screening.
          It’s educational only. Use the left panel to complete it and review a
          plain-language reflection of your answers.
        </p>
      </details>

      <details className="blk">
        <summary className="sum">Helpful Resources</summary>
        <ul className="bullets">
          <li><a href="https://www.autismspeaks.org/" target="_blank" rel="noreferrer">Autism Speaks</a></li>
          <li><a href="https://www.autistica.org.uk/" target="_blank" rel="noreferrer">Autistica (UK)</a></li>
          <li><a href="https://thl.fi/en" target="_blank" rel="noreferrer">THL Finland (Finnish Institute for Health and Welfare)</a></li>
        </ul>
      </details>
    </div>
  );
}
