// frontend/src/features/autism/AutismPanel.jsx
export default function AutismPanel() {
  return (
    <div className="card">
      <h2 className="card-title">Autism Focus (Educational)</h2>
      <p className="muted">
        This section offers general, plain-language information about autism
        spectrum (ASD). It is not a diagnosis. For concerns about yourself or
        your child, please contact a qualified professional in your local
        health system.
      </p>

      <details className="blk" open>
        <summary className="sum">What is Autism?</summary>
        <p>
          Autism spectrum (ASD) is a neurodevelopmental difference that affects
          how a person processes social information, communication, sensory
          input and routines. Autism is lifelong, but the way it shows up can
          change over time and looks very different from person to person.
        </p>
        <p>
          Many autistic people describe strengths such as deep focus, strong
          interests and detail-oriented thinking. At the same time, some people
          may need support with social situations, changes in routine, or
          sensory overload (for example from noise, lights, or crowded places).
        </p>
      </details>

      <details className="blk">
        <summary className="sum">Everyday Signs & Experiences</summary>
        <ul className="bullets">
          <li>
            Differences in eye contact, play, or social interaction compared to
            peers.
          </li>
          <li>
            Strong preference for routines or very specific interests (for
            example trains, numbers, or certain games).
          </li>
          <li>
            Sensitivities to sound, light, clothing textures or certain foods.
          </li>
          <li>
            Communication differences – speaking later than expected, using
            unusual phrases, or finding it hard to interpret tone or body
            language.
          </li>
        </ul>
        <p className="muted">
          These signs do not prove autism on their own, but they can be a signal
          that further assessment and support might be helpful.
        </p>
      </details>

      <details className="blk">
        <summary className="sum">Support & Therapy (Examples)</summary>
        <ul className="bullets">
          <li>
            Parent- or caregiver-guided communication strategies and play-based
            interventions.
          </li>
          <li>
            Occupational therapy to support sensory regulation and daily
            routines.
          </li>
          <li>
            Visual schedules, predictable routines and clear transitions at
            home, daycare or school.
          </li>
          <li>
            Strength-based learning environments that build on the person&apos;s
            interests.
          </li>
        </ul>
        <p className="muted">
          Support should always be tailored to the individual. Local clinical
          teams (neurologists, child psychiatrists, psychologists, speech and
          occupational therapists) can advise on options in your area.
        </p>
      </details>

      <details className="blk">
        <summary className="sum">Further Information in Finland</summary>
        <p>
          In Finland, official information about autism and neurodevelopmental
          conditions is provided by{" "}
          <a
            href="https://thl.fi/en/"
            target="_blank"
            rel="noreferrer"
          >
            THL – Finnish Institute for Health and Welfare
          </a>{" "}
          (Terveyden ja hyvinvoinnin laitos) and through local wellbeing
          services counties (hyvinvointialueet).
        </p>
        <ul className="bullets">
          <li>
            THL website – information about children&apos;s development,
            neurodevelopment and services.
          </li>
          <li>
            Your local health centre, student health care or child health clinic
            (neuvola) can provide guidance and referrals.
          </li>
        </ul>
      </details>

      <details className="blk">
        <summary className="sum">International Trusted Resources</summary>
        <ul className="bullets">
          <li>
            <a
              href="https://www.who.int/news-room/fact-sheets/detail/autism-spectrum-disorders"
              target="_blank"
              rel="noreferrer"
            >
              World Health Organization – Autism Spectrum Disorders
            </a>
          </li>
          <li>
            <a
              href="https://www.cdc.gov/ncbddd/autism/"
              target="_blank"
              rel="noreferrer"
            >
              U.S. CDC – Autism Spectrum Disorder (ASD)
            </a>
          </li>
          <li>
            <a
              href="https://www.autism.org.uk/"
              target="_blank"
              rel="noreferrer"
            >
              National Autistic Society (UK)
            </a>
          </li>
        </ul>
        <p className="muted">
          These sites provide more in-depth explanations, research summaries and
          practical guidance for families, adults and professionals.
        </p>
      </details>

      <details className="blk">
        <summary className="sum">If You Are Worried Right Now</summary>
        <p>
          If you are concerned about yourself or your child, the next step is
          to talk to a professional who can see the whole picture – not only
          the answers from this tool.
        </p>
        <ul className="bullets">
          <li>
            In emergencies or acute mental health crises, contact your local
            emergency number (for example 112 in Finland).
          </li>
          <li>
            For non-urgent concerns, book an appointment with your local health
            centre, student health care, or occupational health service.
          </li>
        </ul>
      </details>
    </div>
  );
}
