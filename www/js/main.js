document.addEventListener("DOMContentLoaded", () => {
  // DOM references
  const silhouette = d3.select("#silhouette");
  const roleEl = d3.select("#speaker-role");
  const timeEl = d3.select("#speaker-time");
  const contextEl = d3.select("#context-text");
  const quoteEl = d3.select("#quote-text");

  const defaultSilhouettes = {
    president: "img/president.png",
    official: "img/official.png",
    journalist: "img/journalist.png"
  };

  let stepsData = [];

  // Pulse globals
  let svg, w, h, xScale, baseY, amp, line, pulsePath;

  /* ===============================
     LOAD DATA FROM steps.json
  =============================== */

  d3.json("data/steps.json")
    .then(data => {
      stepsData = data;
      buildSteps(stepsData);
      initPulse(stepsData);
      initScroll(stepsData);

      if (stepsData.length > 0) {
        updateCards(stepsData[0]);
        updatePulse(0);
      }
    })
    .catch(err => {
      console.error("Error loading steps.json:", err);
      contextEl.text("Error loading story data.");
      quoteEl.text("");
    });

  /* ===============================
     BUILD INVISIBLE SCROLL STEPS
  =============================== */

  function buildSteps(data) {
    const container = d3.select("#sections");

    container
      .selectAll(".step")
      .data(data)
      .enter()
      .append("div")
      .attr("class", "step")
      .attr("data-id", d => d.id);
  }

  /* ===============================
     PULSE LINE (BACKGROUND)
  =============================== */

  function initPulse(data) {
    svg = d3.select("#pulse-svg");

    w = svg.node().clientWidth || window.innerWidth;
    h = svg.node().clientHeight || 200;

    svg.attr("width", w).attr("height", h);

    const n = data.length;
    xScale = d3.scaleLinear()
      .domain([0, Math.max(1, n - 1)])
      .range([40, w - 40]);

    baseY = h / 2;
    amp = h * 0.3;

    line = d3.line()
      .x(d => xScale(d.index))
      .y(d => baseY - d.sentiment * amp)
      .curve(d3.curveMonotoneX);

    // Baseline
    svg.append("line")
      .attr("x1", 0)
      .attr("x2", w)
      .attr("y1", baseY)
      .attr("y2", baseY)
      .attr("stroke", "#D0D0D0")
      .attr("stroke-width", 1);

    // Pulse path
    pulsePath = svg.append("path")
      .attr("fill", "none")
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke", "#888888");
  }

  function pulseColor(sentiment) {
    if (sentiment > 0.2) return "#4D88FF";    // blue = positive
    if (sentiment < -0.2) return "#9B2915";   // red = negative
    return "#545151";                         // gray = neutral
  }

  function updatePulse(i) {
    if (!stepsData.length || !pulsePath) return;

    const subset = stepsData
      .slice(0, i + 1)
      .map((d, idx) => ({
        index: idx,
        sentiment: d.sentiment || 0
      }));

    const currentSent = stepsData[i].sentiment || 0;

    pulsePath
      .datum(subset)
      .transition()
      .duration(500)
      .attr("d", line)
      .attr("stroke", pulseColor(currentSent));
  }

  /* ===============================
     UPDATE FIXED PANEL (character + text)
  =============================== */

  function updateCards(d) {
    // Silhouette (use custom if provided, else default by speaker)
    const imgSrc = d.silhouette || defaultSilhouettes[d.speaker] || defaultSilhouettes["president"];

    silhouette
      .transition()
      .duration(250)
      .style("opacity", 0)
      .on("end", () => {
        silhouette.attr("src", imgSrc);
      })
      .transition()
      .duration(250)
      .style("opacity", 1);

    // Role label
    let roleLabel = "Speaker";
    if (d.speaker === "president") roleLabel = "President";
    else if (d.speaker === "journalist") roleLabel = "Journalist";
    else if (d.speaker === "official") roleLabel = "Government Official";

    roleEl.text(roleLabel);

    // Time label (if available)
    if (d.time) {
      timeEl.text(d.time);
    } else {
      timeEl.text("");
    }

    // Context (narration)
    contextEl
      .transition()
      .duration(120)
      .style("opacity", 0)
      .on("end", () => {
        contextEl.text(d.context);
      })
      .transition()
      .duration(220)
      .style("opacity", 1);

    // Quote (direct text)
    quoteEl
      .transition()
      .duration(120)
      .style("opacity", 0)
      .on("end", () => {
        quoteEl.text(d.quote);
      })
      .transition()
      .duration(220)
      .style("opacity", 1);
  }

  /* ===============================
     SCROLLAMA
  =============================== */

  function initScroll(data) {
    const scroller = scrollama();

    scroller
      .setup({
        step: "#sections .step",
        offset: 0.7,
        debug: false
      })
      .onStepEnter(response => {
        const idx = response.index;
        const stepData = data[idx];

        updateCards(stepData);
        updatePulse(idx);
      });

    window.addEventListener("resize", () => {
      scroller.resize();
    });
  }
});
