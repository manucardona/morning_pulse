// Obtained this dataset from ChatGPT on 2024-06-10:

//Please write a full file for my Explore tab. I need a synthetic but realistic dataset of mañaneras for testing. The script should:

//– Print a console log when loaded.
//– Generate ~50 mañaneras starting from Jan 2024, every 1–3 days.
//- For each mañanera, produce realistic metadata: id, date, title, location_state (CDMX most days, but sometimes a Mexican state).
//– For each mañanera, generate 25–45 interventions divided into an intro block (mostly president/officials) and a Q&A block (journalists with follow-ups and interruptions).
//– Assign actor roles (president, official, journalist), names, sentiments (realistic distributions), timestamps, topics (choose from a realistic topic list), text snippets, and states mentioned.
//– End the file by setting window.conferences = [...] with the generated array.
//– Ensure the schema matches: each conference has an interventions array with idx, timestamp_minute, actor_role, actor_name, sentiment, topics, text, is_interruption, is_followup, mentioned_states.
//-Produce clean, production-ready JavaScript.


// data/explore_data.js
// Synthetic but structured mañanera data for the Explore tab.
// Produces window.conferences with ~realistic role, topic, sentiment, and state patterns.

(function () {
  console.log("explore_data.js loaded with synthetic mañaneras");

  // -----------------------------
  // CONFIG
  // -----------------------------
  const N_CONFERENCES = 50;          // how many mañaneras to simulate
  const BASE_DATE = new Date("2024-01-02T09:00:00"); // starting date
  const DAY_STEP = 2;                // every 2 days

  // Topic palette
  const TOPICS = [
    "security",
    "economy",
    "corruption",
    "social programs",
    "health",
    "vaccines",
    "education",
    "infrastructure",
    "energy",
    "migration",
    "human rights",
    "environment",
    "water crisis",
    "elections",
    "rural policy"
  ];

  // Mexican states (subset + CDMX)
  const STATES = [
    "CDMX", "Estado de México", "Jalisco", "Nuevo León", "Chiapas",
    "Oaxaca", "Guerrero", "Veracruz", "Puebla", "Sonora",
    "Tabasco", "Guanajuato", "Baja California", "Chihuahua",
    "Yucatán", "Hidalgo"
  ];

  const PRESIDENT_NAME = "AMLO";
  const OFFICIAL_NAMES = [
    "Rosa Icela Rodríguez",
    "Secretario de Salud",
    "Titular de SEGOB",
    "Director de CONAGUA",
    "Secretario de Hacienda",
    "Canciller"
  ];
  const JOURNALIST_NAMES = [
    "Jorge Ramos",
    "Ana Soto",
    "Carlos Torres",
    "Diana Pérez",
    "María López",
    "Luis Herrera",
    "Patricia Gómez",
    "Ricardo Méndez",
    "Sofía Ruiz",
    "Alejandro Cruz"
  ];

  // -----------------------------
  // HELPERS
  // -----------------------------
  function formatDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randomTopics(dayPrimaryTopics) {
    // Bias towards 1–2 main topics for the day, plus a random extra
    const topics = [];
    const k = randomInt(1, 3);
    const pool = [...dayPrimaryTopics];

    // add some noise from global TOPICS
    if (Math.random() < 0.4) {
      pool.push(randomChoice(TOPICS));
    }

    const shuffled = pool.sort(() => Math.random() - 0.5);
    for (let i = 0; i < k; i++) {
      topics.push(shuffled[i % shuffled.length]);
    }
    return topics;
  }

  function randomSentiment(actor_role, isIntroPhase) {
    // Rough heuristic:
    // - President/official: mildly positive, especially in intro
    // - Journalists: more mixed/critical, especially in Q&A
    let mean = 0;
    let spread = 0.4;

    if (actor_role === "president" || actor_role === "official") {
      mean = isIntroPhase ? 0.3 : 0.15;   // more upbeat in intro
      spread = 0.35;
    } else if (actor_role === "journalist") {
      mean = isIntroPhase ? -0.1 : -0.2;  // more critical in Q&A
      spread = 0.5;
    }

    // simple clamped Gaussian-like sample using Box–Muller-ish trick
    const u = Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v);
    const val = mean + z * (spread / 2);
    return Math.max(-1, Math.min(1, val));
  }

  function randomStatesForDay(mainState) {
    // Most days are in CDMX, some are on tour in the states
    const mentioned = [];
    if (mainState) {
      mentioned.push(mainState);
    }
    if (Math.random() < 0.3) {
      mentioned.push(randomChoice(STATES));
    }
    if (Math.random() < 0.15) {
      mentioned.push(randomChoice(STATES));
    }
    // remove duplicates
    return Array.from(new Set(mentioned));
  }

  // -----------------------------
  // MAIN GENERATOR
  // -----------------------------
  function generateConferences(n) {
    const conferences = [];

    for (let i = 0; i < n; i++) {
      const dateObj = new Date(
        BASE_DATE.getTime() + i * DAY_STEP * 24 * 60 * 60 * 1000
      );
      const dateStr = formatDate(dateObj);

      // LOCATION: ~55% CDMX, otherwise states (like "gira")
      const isCDMX = Math.random() < 0.55;
      const location_state = isCDMX ? "CDMX" : randomChoice(STATES.filter(s => s !== "CDMX"));

      // Day-level topics: pick 2 "main" topics and use them heavily
      const primaryTopic1 = randomChoice(TOPICS);
      let primaryTopic2 = randomChoice(TOPICS);
      if (primaryTopic2 === primaryTopic1) {
        primaryTopic2 = randomChoice(TOPICS.filter(t => t !== primaryTopic1));
      }
      const dayPrimaryTopics = [primaryTopic1, primaryTopic2];

      // Number of interventions:
      // - intro block: 10–18 (mostly gov)
      // - Q&A block: 15–30 (journalists + gov responses)
      const introCount = randomInt(10, 18);
      const qaCount = randomInt(15, 30);
      const totalInterventions = introCount + qaCount;

      const interventions = [];
      let timestamp = 0;

      // ----- INTRO BLOCK (mainly president + officials) -----
      for (let idx = 0; idx < introCount; idx++) {
        const actor_role = Math.random() < 0.7 ? "president" : "official";
        const actor_name =
          actor_role === "president"
            ? PRESIDENT_NAME
            : randomChoice(OFFICIAL_NAMES);

        const topics = randomTopics(dayPrimaryTopics);
        const sentiment = randomSentiment(actor_role, true);

        // States: in intro they name the current state or CDMX more
        const mentioned_states = randomStatesForDay(location_state);

        const textPrefix =
          actor_role === "president" ? "Mensaje inicial sobre " : "Informe técnico sobre ";

        interventions.push({
          idx,
          timestamp_minute: timestamp,
          actor_role,
          actor_name,
          sentiment,
          topics,
          text: textPrefix + topics.join(", ") + ".",
          is_interruption: false,
          is_followup: false,
          mentioned_states
        });

        timestamp += randomInt(1, 4);
      }

      // ----- Q&A BLOCK (journalists + gov replies, more back-and-forth) -----
      let idxCounter = introCount;

      for (let j = 0; j < qaCount; j++) {
        const isJournalistTurn = j % 2 === 0; // alternate J ↔ G
        let actor_role;
        if (isJournalistTurn) {
          actor_role = "journalist";
        } else {
          actor_role = Math.random() < 0.6 ? "president" : "official";
        }

        let actor_name;
        if (actor_role === "president") actor_name = PRESIDENT_NAME;
        else if (actor_role === "official") actor_name = randomChoice(OFFICIAL_NAMES);
        else actor_name = randomChoice(JOURNALIST_NAMES);

        const topics = randomTopics(dayPrimaryTopics);
        const sentiment = randomSentiment(actor_role, false);

        const statesToday = randomStatesForDay(location_state);
        // Journalists sometimes mention extra states
        const mentioned_states =
          actor_role === "journalist" && Math.random() < 0.5
            ? statesToday.concat(randomChoice(STATES))
            : statesToday;

        const is_interruption =
          actor_role === "journalist" && Math.random() < 0.12;
        const is_followup =
          !is_interruption && Math.random() < 0.25 && actor_role === "journalist";

        const text =
          actor_role === "journalist"
            ? "Pregunta sobre " + topics.join(", ") + "."
            : "Respuesta sobre " + topics.join(", ") + ".";

        interventions.push({
          idx: idxCounter,
          timestamp_minute: timestamp,
          actor_role,
          actor_name,
          sentiment,
          topics,
          text,
          is_interruption,
          is_followup,
          mentioned_states: Array.from(new Set(mentioned_states))
        });

        idxCounter += 1;
        timestamp += randomInt(1, 3);
      }

      conferences.push({
        id: dateStr,
        date: dateStr,
        title: `Mañanera del ${dateStr}`,
        location_state,
        interventions
      });
    }

    return conferences;
  }

  // -----------------------------
  // BUILD & EXPOSE
  // -----------------------------
  window.conferences = generateConferences(N_CONFERENCES);
  console.log("Generated mañaneras:", window.conferences.length);
})();
