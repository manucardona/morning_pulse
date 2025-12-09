document.addEventListener("DOMContentLoaded", () => {
  // 1. Load steps.json
  fetch("data/steps_enriched.json")
    .then((res) => {
      if (!res.ok) throw new Error("Failed to load steps.json, Make sure data is in 'data' folder.");
      return res.json();
    })
    .then((data) => {
      initScrolly(data);
    })
    .catch((err) => {
      console.error("Error loading steps.json:", err);
    });
});

function initScrolly(conversationData) {
  const sections = document.getElementById("sections");
  sections.innerHTML = ""; 

  conversationData.forEach((d, i) => {
    const step = document.createElement("div");
    step.className = "step";
    step.dataset.index = i;
    sections.appendChild(step);
  });

  const speakerImages = {
    president: "img/president.png",
    official: "img/official.png",
    journalist: "img/journalist.png",
  };

  const silhouette = d3.select("#silhouette");
  const roleEl = d3.select("#speaker-role");
  const timeEl = d3.select("#speaker-time");
  const quoteEl = d3.select("#quote-text");
  const contextEl = d3.select("#context-text");

  const caption = document.getElementById("pulse-caption");
  const callout = document.getElementById("pulse-callout");
  const nextBtn = document.getElementById("next-step-btn");

  // Pulse line
  const svg = d3.select("#pulse-svg");
  const w = svg.node().clientWidth || svg.node().getBoundingClientRect().width;
  const h = svg.node().clientHeight || svg.node().getBoundingClientRect().height;

  const xScale = d3
    .scaleLinear()
    .domain([0, conversationData.length - 1])
    .range([40, w - 40]);

  const baseY = h / 2;  // center line
  const amp = h * 0.3;  // amplitude for sentiment

  // Used GPT-4 to suggest this curve type for smoother transitions
  const line = d3
    .line()
    .x((d) => xScale(d.index))
    .y((d) => baseY - d.sentiment * amp)
    .curve(d3.curveMonotoneX);  

  const pulse = svg
    .append("path")
    .attr("fill", "none")
    .attr("stroke-width", 3)
    .attr("stroke-linecap", "round");

  svg
    .append("line")
    .attr("x1", 0)
    .attr("x2", w)
    .attr("y1", baseY)
    .attr("y2", baseY)
    .attr("stroke", "#D0D0D0")
    .attr("stroke-width", 1);

  function pulseColor(s) {
    if (s > 0.25) return "#4D88FF";   // positive
    if (s < -0.25) return "#C70039";  // negative
    return "#888888";                 // neutral
  }

  function updatePulse(i) {
    // Takes the first i+1 entries of conversationData
    // and converts them to index and sentiment
    const subset = conversationData
      .slice(0, i + 1)
      .map((d, j) => ({ index: j, sentiment: d.sentiment }));

    const sent = conversationData[i].sentiment;

    // Update the pulse path
    pulse
      .datum(subset)
      .transition()
      .duration(500)
      .attr("d", line)
      .attr("stroke", pulseColor(sent));
  }

  // Update elements (silhouette + context + quote)
  function updateCards(d) {
    silhouette
      .transition()
      .duration(250)
      .style("opacity", 0)
      .on("end", () => {
        silhouette.attr("src", speakerImages[d.speaker] || speakerImages.official);
      })
      .transition()
      .duration(250)
      .style("opacity", 1);

    const roleLabel =
      d.speaker === "president"
        ? "President"
        : d.speaker === "journalist"
        ? "Journalist"
        : "Government Official";

    roleEl.text(roleLabel);
    timeEl.text(d.time || "");

    contextEl
      .transition()
      .duration(100)
      .style("opacity", 0)
      .on("end", () => contextEl.text(d.context || ""))
      .transition()
      .duration(250)
      .style("opacity", 1);

    const quoteToShow = d.quote_en || d.quote || "";
    quoteEl
      .transition()
      .duration(100)
      .style("opacity", 0)
      .on("end", () => quoteEl.text(quoteToShow))
      .transition()
      .duration(250)
      .style("opacity", 1);
  }

  // Scrollama
  const scroller = scrollama();
  let currentIndex = 0;

  scroller
    .setup({
      step: ".step",
      offset: 0.7,
    })
    .onStepEnter((resp) => {
      const i = resp.index;
      const d = conversationData[i];
      currentIndex = i;

      updateCards(d);
      updatePulse(i);

      // Include callout for first steps so the user notices and understands it
      if (callout && i <= 3 && i > 0) {
        const sent = d.sentiment;

        // 1) Compute SVG coordinates for this point
        const svgRect = svg.node().getBoundingClientRect();
        const px = svgRect.left + xScale(i);                  // x in viewport
        const py = svgRect.top + (baseY - sent * amp);        // y in viewport

        // 2) Set text based on sentiment
        let description = "";
        if (sent > 0.25) {
          description = "Here, the tone is mainly positive.";
        } else if (sent < -0.25) {
          description = "Here, the tone shifts negative.";
        } else {
          description = "Here, the tone is mostly neutral.";
        }

        callout.textContent = description;

        // 3) Move box to that point
        callout.style.left = `${px}px`;
        callout.style.top = `${py}px`;
        callout.classList.remove("hidden");
        callout.classList.add("visible");
      } else if (callout) {
        callout.classList.remove("visible");
        callout.classList.add("hidden");
      }

      // Existing caption hide/show logic
      if (caption) {
        if (i >= 2) caption.classList.add("hidden");
        else caption.classList.remove("hidden");
      }
    });

  // Next button
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const total = conversationData.length;
      const next = Math.min(currentIndex + 1, total - 1);
      const nextStep = document.querySelector(`.step[data-index="${next}"]`);
      if (nextStep) {
        nextStep.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    });
  }

  // Initial state
  updateCards(conversationData[0]);
  updatePulse(0);

  window.addEventListener("resize", () => scroller.resize());
}

