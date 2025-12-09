// js/explore.js
console.log("explore.js (JSON version) loaded");

const exploreState = {
  conferences: [],
  topicTrends: [],
  current: null
};

document.addEventListener("DOMContentLoaded", () => {
  d3.json("data/explore_data.json").then(data => {
    console.log("Loaded explore_data.json:", data);

    const allConfs = data.conferences || [];

    // Filter: only keep conferences where journalists participate
    const withJournalists = allConfs.filter(conf => {
      const tt = conf.turn_taking || {};
      const journalistTurns = tt.journalist_turns ?? 0;
      return journalistTurns > 0;
    });

    exploreState.conferences = withJournalists;
    exploreState.topicTrends = data.topic_trends_weekly || [];

    // Just in case, log a warning if no conferences found
    if (!exploreState.conferences.length) {
      console.warn("No conferences with journalists found");
      d3.select("#explore-meta").text("No conferences with journalist available.");
      return;
    }

    initConferenceSelect();
    initTopicTrends();

    const first = exploreState.conferences[0];
    console.log("First conference from JSON:", first.date, first.title);
    exploreState.current = first;
    renderConference(first);
  }).catch(err => {
    console.error("Error loading explore_data.json:", err);
    d3.select("#explore-meta").text("Could not load data.");
  });
});


// User Interface init
function initConferenceSelect() {
  const select = d3.select("#explore-conference-select");

  const confsSorted = [...exploreState.conferences].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  select
    .selectAll("option")
    .data(confsSorted)
    .join("option")
    .attr("value", d => d.id)
    .text(d => `${d.date} — ${d.title}`);

  select.property("value", confsSorted[0].id);

  select.on("change", (event) => {
    const id = event.target.value;
    const chosen = exploreState.conferences.find(c => c.id === id);
    console.log("Changed to conference:", id);
    if (chosen) {
      exploreState.current = chosen;
      renderConference(chosen);
    }
  });
}

// Main function to render all components for a conference
function renderConference(conf) {
  console.log("Rendering conference:", conf.id);
  renderMeta(conf);
  renderInteractionCard(conf);
  renderSentimentChart(conf);
  renderStatesChart(conf);
  renderTopics(conf);
}

// Pretty topic label. Used GPT-4 to help me write this function.
// Write a JavaScript function that takes a raw BERTopic topic label such as 
// "70_impuestos_imss_impuesto_pagan" and returns a human-readable label. 
// The function should:
// - Convert the input to string and split on underscores.
// - If the first token is a numeric topic ID, drop it.
// - Keep only the first 2–3 meaningful words.
// - Recognize specific acronyms (imss, issste, sat, ine, pemex, cfe, 
// imss-bienestar) and return them UPPERCASE.
// - For all other words, capitalize only the first letter (e.g., salud → Salud).

function prettifyTopicLabel(raw) {
  if (!raw) return "";

  const str = String(raw);

  // Example raw: "70_impuestos_imss_impuesto_pagan"
  let parts = str.split("_");

  // If it starts with a numeric topic id, drop it
  if (parts.length > 1 && /^\d+$/.test(parts[0])) {
    parts = parts.slice(1);
  }

  // Keep only the first 2–3 keywords
  const words = parts.slice(0, 2).map(w => w.trim()).filter(Boolean);
  if (!words.length) return str;

  const ACRONYMS = ["imss", "issste", "sat", "ine", "pemex", "cfe", "imss-bienestar"];

  const cleaned = words.map(w => {
    const lw = w.toLowerCase();
    if (ACRONYMS.includes(lw)) return lw.toUpperCase();
    // Capitalize first letter
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  });

  // Join with a nice separator
  return cleaned.join(" · ");
}


// meta info
function renderMeta(conf) {
  const meta = d3.select("#explore-meta");
  meta.html("");

  const c = meta.append("div");
  c.append("div").text(`Date: ${conf.date} (${conf.weekday || ""})`);
  c.append("div").text(`Title: ${conf.title || "Sin título"}`);
  if (conf.length_words != null) {
    c.append("div").text(`Approx. length: ${conf.length_words.toLocaleString()} words`);
  }
  if (conf.url) {
    c.append("div")
      .append("a")
      .attr("href", conf.url)
      .attr("target", "_blank")
      .text("View full transcript");
  }
}

function renderInteractionCard(conf) {
  const card = d3.select("#explore-behavior-card");
  card.html("");

  const tt = conf.turn_taking || {};
  const total = tt.total_turns ?? 0;
  const pres = tt.president_turns ?? 0;
  const journ = tt.journalist_turns ?? 0;
  const ratio = tt.ratio_president_journalist;

  card.append("div").text(`Total interventions: ${total}`);
  card.append("div").text(`President interventions: ${pres}`);
  card.append("div").text(`Journalist interventions: ${journ}`);

  if (ratio != null && isFinite(ratio)) {
    card.append("div").text(
      `President : Journalist ratio ≈ ${ratio.toFixed(2)} : 1`
    );
  } else {
    card.append("div").text("President : Journalist ratio not available.");
  }
}

// sentiment chart 
function renderSentimentChart(conf) {
  const container = d3.select("#sentiment-chart");
  container.html("");

  const data = conf.sentiment_series || [];
  if (!data.length) {
    container.append("p").text("No sentiment data available for this conference.");
    return;
  }

  const width = container.node().clientWidth || 360;
  const height = 240;
  const margin = { top: 24, right: 20, bottom: 30, left: 55 };

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  // 1. Scales
  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => d.order))
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain([-1, 1])
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleOrdinal()
    .domain(["President", "Official", "Journalist"])
    .range(["#9B2915", "#E9B872", "#063A35"]);

  // 2. Compute rolling average (last N interventions per role_group)
  const windowSize = 10;
    const byRole = d3.group(data, d => d.role_group);

    for (const [role, values] of byRole) {
    const sorted = values.slice().sort((a, b) => d3.ascending(a.order, b.order));

    // rolling average
    let acc = [];
    sorted.forEach(d => {
        acc.push(d.sentiment_score);
        if (acc.length > windowSize) acc.shift();
        d.rolling_avg = d3.mean(acc);
    });

    // build segments that break when gap in order is too large
    const maxGap = 5;
    const segments = [];
    let current = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        if (cur.order - prev.order <= maxGap) {
        current.push(cur);
        } else {
        segments.push(current);
        current = [cur];
        }
    }
    segments.push(current);

    segments.forEach(seg => {
        svg.append("path")
        .datum(seg)
        .attr("fill", "none")
        .attr("stroke", color(role))
        .attr("stroke-width", 2)
        .attr("d", d3.line()
            .x(d => x(d.order))
            .y(d => y(d.rolling_avg))
        )
        .attr("opacity", 0.95);
    });
    }

  // 3. Line generator using rolling_avg
  const line = d3.line()
    .x(d => x(d.order))
    .y(d => y(d.rolling_avg));

  // 4. Draw one line per role_group
  for (const [role, values] of byRole) {
    svg.append("path")
      .datum(values)
      .attr("fill", "none")
      .attr("stroke", color(role))
      .attr("stroke-width", 2)
      .attr("d", line)
      .attr("opacity", 0.95);
  }

  // 5. Axes
  // X axis: only start / end labels
  const [xMin, xMax] = x.domain().map(Math.round);

  const xAxis = d3.axisBottom(x)
    .tickValues([xMin, xMax])
    .tickFormat((d, i) =>
      i === 0 ? "Start" : "End"
    );
  // Y axis: only Positive/Neutral/Negative labels
  const yAxis = d3.axisLeft(y)
    .tickValues([-1, 0, 1])
    .tickFormat(d => {
      if (d === -1) return "Negative";
      if (d === 0) return "Neutral";
      if (d === 1) return "Positive";
      return d;
    });

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(xAxis)
    .selectAll("text")
      .attr("font-size", 11)
      .attr("text-anchor", "middle");

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis)
    .selectAll("text")
      .attr("font-size", 10);

  // Neutral baseline (sentiment = 0) -- Gray line
  svg.append("line")
    .attr("x1", x(x.domain()[0]))
    .attr("x2", x(x.domain()[1]))
    .attr("y1", y(0))
    .attr("y2", y(0))
    .attr("stroke", "#999")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4 4");


  // 6. Legend
  const legendRoles = ["President", "Official", "Journalist"];
  const legendLabels = {
    "President": "President",
    "Official": "Official",
    "Journalist": "Journalists"
  };

  const presentRoles = legendRoles.filter(r => byRole.has(r));

  const legend = svg.append("g")
    .attr("transform", `translate(${width - margin.right - 110}, ${margin.top})`);

  presentRoles.forEach((role, i) => {
    const g = legend.append("g")
      .attr("transform", `translate(0, ${i * 16})`);

    g.append("rect")
      .attr("width", 10)
      .attr("height", 10)
      .attr("fill", color(role));

    g.append("text")
      .attr("x", 14)
      .attr("y", 9)
      .attr("font-size", 11)
      .text(legendLabels[role]);
  });
}



// states chart
function renderStatesChart(conf) {
  const container = d3.select("#states-chart");
  container.html("");

  let data = conf.states_mentioned || [];
  if (!data.length) {
    container.append("p").text("No states mentioned explicitly in this conference.");
    return;
  }

  // 1. Take only the top 5 states by mentions and exclude Estado de México
  data = data.filter(d => d.state.toLowerCase() !== "estado de mexico");

  if (!data.length) {
    container.append("p").text("No relevant states mentioned (after filtering).");
    return;
  }

  data = data
    .slice()
    .sort((a, b) => d3.descending(a.mentions, b.mentions))
    .slice(0, 5);

  const width = container.node().clientWidth || 360;
  const height = 220;
  const margin = { top: 20, right: 10, bottom: 70, left: 55 };

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  // 2. Use only half of the available width for the bars
  const x = d3.scaleBand()
  .domain(data.map(d => d.state))
  .range([margin.left, width - margin.right])  // full width
  .padding(0.25);


  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.mentions) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // Bars
  svg.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", d => x(d.state))
    .attr("y", d => y(d.mentions))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.mentions))
    .attr("fill", "#9B2915");

  // Text labels on top of bars with frequencies
  svg.selectAll(".state-label")
    .data(data)
    .join("text")
    .attr("class", "state-label")
    .attr("x", d => x(d.state) + x.bandwidth() / 2)
    .attr("y", d => y(d.mentions) - 4)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "#333")
    .text(d => d.mentions);

  // X axis with state names
  const xAxis = d3.axisBottom(x);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(xAxis)
    .selectAll("text")
      .attr("font-size", 10)
      .attr("text-anchor", "end")
      .attr("transform", "rotate(-35)")
      .attr("dx", "-0.4em")
      .attr("dy", "0.8em");

  // Y axis with counts
  const yAxis = d3.axisLeft(y).ticks(4);

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis)
    .selectAll("text")
      .attr("font-size", 10);

  // Y axis title
  svg.append("text")
    .attr("x", margin.left - 45)
    .attr("y", (height / 2))
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#555")
    .attr("transform", `rotate(-90, ${margin.left - 45}, ${height/2})`)
    .text("Number of mentions");

}


// words by role -- Ended up not being used
function renderWordsByRole(conf) {
  const container = d3.select("#role-ratio-chart");
  container.html("");

  const data = conf.words_by_role || [];
  if (!data.length) {
    container.append("p").text("No word counts by role for this conference.");
    return;
  }

  const width = container.node().clientWidth || 360;
  const height = 200;
  const margin = { top: 20, right: 10, bottom: 40, left: 50 };

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleBand()
    .domain(data.map(d => d.speaker_group))
    .range([margin.left, width - margin.right])
    .padding(0.3);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.words) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleOrdinal()
    .domain(["President/Official", "Journalist"])
    .range(["#9B2915", "#2c7bb6"]);

  svg.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", d => x(d.speaker_group))
    .attr("y", d => y(d.words))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.words))
    .attr("fill", d => color(d.speaker_group));
}

function initTopicTrends() {
  renderTopicsChart();
}

function renderTopicsChart() {
  const container = d3.select("#topics-chart");
  container.html("");

  const dataAll = exploreState.topicTrends || [];
  if (!dataAll.length) {
    container.append("p").text("Topic analysis not available.");
    return;
  }

  // Aggregate: average smoothed share per topic across all weeks
  const agg = d3.rollups(
    dataAll.filter(d => d.share_smooth != null && isFinite(d.share_smooth)),
    v => d3.mean(v, d => d.share_smooth),
    d => d.topic
  );

  // Top 5 topics
  const data = agg
    .map(([topic, share]) => ({ topic, share }))
    .sort((a, b) => d3.descending(a.share, b.share))
    .slice(0, 5);

  if (!data.length) {
    container.append("p").text("Topic analysis not available.");
    return;
  }

  const width = container.node().clientWidth || 360;
  const height = 220;
  const margin = { top: 20, right: 10, bottom: 70, left: 65 };

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleBand()
    .domain(data.map(d => d.topic))
    .range([margin.left, width - margin.right])
    .padding(0.25);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.share) || 0.01])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // Bars
  svg.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", d => x(d.topic))
    .attr("y", d => y(d.share))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.share))
    .attr("fill", "#9B2915");

  // Value labels (percent)
  svg.selectAll(".topic-label")
    .data(data)
    .join("text")
    .attr("class", "topic-label")
    .attr("x", d => x(d.topic) + x.bandwidth() / 2)
    .attr("y", d => y(d.share) - 4)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "#333")
    .text(d => `${(d.share * 100).toFixed(1)}%`);

  // X axis
  const xAxis = d3.axisBottom(x);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(xAxis)
    .selectAll("text")
      .attr("font-size", 10)
      .attr("text-anchor", "end")
      .attr("transform", "rotate(-35)")
      .attr("dx", "-0.4em")
      .attr("dy", "0.8em");

  // Y axis
  const yAxis = d3.axisLeft(y).ticks(4);

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(yAxis)
    .selectAll("text")
      .attr("font-size", 10);

  // Y axis title
  svg.append("text")
    .attr("x", margin.left - 55)
    .attr("y", height / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#555")
    .attr("transform", `rotate(-90, ${margin.left - 55}, ${height / 2})`)
    .text("Average share of words");
}

function renderTopics(conf) {
  const container = d3.select("#topics-chart");
  container.selectAll("*").remove();

  // Use the nicer display_label
  const topics = (conf.topics || []).map(d => ({
    ...d,
    display_label: prettifyTopicLabel(d.label)
  }));

  if (!topics.length) {
    container.append("p")
      .text("No dominant topics detected for this conference.");
    return;
  }

  const width = 360;
  const height = 220;
  const margin = { top: 10, right: 10, bottom: 30, left: 140 };

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleLinear()
    .domain([0, d3.max(topics, d => d.count) || 1])
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(topics.map(d => d.display_label))
    .range([margin.top, height - margin.bottom])
    .padding(0.2);

  svg.selectAll("rect.topic-bar")
    .data(topics)
    .join("rect")
    .attr("class", "topic-bar")
    .attr("x", x(0))
    .attr("y", d => y(d.display_label))
    .attr("width", d => x(d.count) - x(0))
    .attr("height", y.bandwidth())
    .attr("fill", "#9B2915")
    .attr("opacity", 0.8);

  svg.selectAll("text.topic-count")
    .data(topics)
    .join("text")
    .attr("class", "topic-count")
    .attr("x", d => x(d.count) + 4)
    .attr("y", d => y(d.display_label) + y.bandwidth() / 2)
    .attr("dominant-baseline", "middle")
    .attr("font-size", 11)
    .text(d => d.count);

  svg.append("g")
    .attr("transform", `translate(${margin.left - 5},0)`)
    .call(d3.axisLeft(y))
    .selectAll("text")
    .attr("font-size", 11);

  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(4))
    .selectAll("text")
    .attr("font-size", 10);

  svg.append("text")
    .attr("x", (margin.left + width - margin.right) / 2)
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .text("Interventions assigned to topic");
}
