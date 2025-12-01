// js/explore.js

(function () {
  // -------------------------
  //  MODULE: STATE
  // -------------------------
  const ExploreState = {
    conferences: window.conferences || [],
    currentId: null,

    hasData() {
      return Array.isArray(this.conferences) && this.conferences.length > 0;
    },

    setCurrent(id) {
      this.currentId = id;
    },

    getCurrent() {
      return this.conferences.find(c => c.id === this.currentId) || null;
    },

    getDefaultId() {
      return this.hasData() ? this.conferences[0].id : null;
    }
  };

  // -------------------------
  //  MODULE: PANELS (SIDEBAR)
  // -------------------------
  const ExplorePanels = {
    renderMeta(conf) {
      const container = d3.select("#explore-meta");
      const ints = conf.interventions || [];

      const nInterventions = ints.length;
      const nPres = ints.filter(d => d.actor_role === "president").length;
      const nOff = ints.filter(d => d.actor_role === "official").length;
      const nJour = ints.filter(d => d.actor_role === "journalist").length;

      container.html("");

      container.append("div").html(`<strong>Date:</strong> ${conf.date || "—"}`);
      container.append("div").html(`<strong>Title:</strong> ${conf.title || "—"}`);
      if (conf.location_state) {
        container.append("div").html(`<strong>Location:</strong> ${conf.location_state}`);
      }
      container.append("div").html(`<strong>Total interventions:</strong> ${nInterventions}`);
      container.append("div").html(`<strong>President:</strong> ${nPres}`);
      container.append("div").html(`<strong>Officials:</strong> ${nOff}`);
      container.append("div").html(`<strong>Journalists:</strong> ${nJour}`);
    },

    renderBehavior(conf) {
      const container = d3.select("#explore-behavior-card");
      const ints = conf.interventions || [];

      const nInterruptions = ints.filter(d => d.is_interruption).length;
      const nFollowups = ints.filter(d => d.is_followup).length;
      const avgLen = d3.mean(ints, d =>
        d && d.text ? d.text.trim().split(/\s+/).length : 0
      );

      container.html("");

      container.append("div").html(`<strong>Interruptions:</strong> ${nInterruptions}`);
      container.append("div").html(`<strong>Follow-up questions:</strong> ${nFollowups}`);
      container.append("div").html(
        `<strong>Avg. words per turn:</strong> ${
          Number.isFinite(avgLen) ? avgLen.toFixed(1) : "—"
        }`
      );
    }
  };

  // -------------------------
  //  MODULE: CHARTS
  // -------------------------
  const ExploreCharts = {
    renderSentiment(conf) {
      const container = d3.select("#sentiment-chart");
      container.selectAll("*").remove();

      const node = container.node();
      if (!node) return;

      const width = node.clientWidth || 400;
      const height = 220;
      const margin = { top: 24, right: 10, bottom: 30, left: 35 };

      const svg = container
        .append("svg")
        .attr("width", width)
        .attr("height", height);

      const g = svg
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const ints = (conf.interventions || []).filter(d => d.sentiment != null);
      if (!ints.length) {
        g.append("text")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight / 2)
          .attr("text-anchor", "middle")
          .text("No sentiment data for this conference");
        return;
      }

      const data = ints.map((d, i) => ({
        ...d,
        xVal: d.timestamp_minute ?? i,
        idx: i
      }));

      const x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.xVal))
        .nice()
        .range([0, innerWidth]);

      const y = d3.scaleLinear()
        .domain([-1, 1])
        .range([innerHeight, 0]);

      const color = d3.scaleOrdinal()
        .domain(["president", "official", "journalist"])
        .range(["#9B2915", "#E9B872", "#063A35"]);

      const actors = d3.group(data, d => d.actor_role);

      const line = d3.line()
        .x(d => x(d.xVal))
        .y(d => y(d.sentiment))
        .curve(d3.curveMonotoneX);

      for (const [role, values] of actors) {
        g.append("path")
          .datum(values)
          .attr("fill", "none")
          .attr("stroke", color(role))
          .attr("stroke-width", 1.8)
          .attr("d", line)
          .attr("opacity", 0.9);
      }

      const xAxis = d3.axisBottom(x)
        .ticks(5)
        .tickFormat(d =>
          data[0].timestamp_minute != null ? `${d} min` : `#${d}`
        );
      const yAxis = d3.axisLeft(y).ticks(5);

      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(xAxis);

      g.append("g").call(yAxis);

      // zero line
      g.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", y(0))
        .attr("y2", y(0))
        .attr("stroke", "#ccc")
        .attr("stroke-dasharray", "3,3");

      // Legend
      const legend = svg
        .append("g")
        .attr("transform", `translate(${margin.left}, 6)`);

      ["president", "official", "journalist"].forEach((role, i) => {
        const row = legend
          .append("g")
          .attr("transform", `translate(${i * 90}, 0)`);

        row
          .append("rect")
          .attr("width", 10)
          .attr("height", 10)
          .attr("fill", color(role));

        row
          .append("text")
          .attr("x", 14)
          .attr("y", 9)
          .attr("font-size", 10)
          .text(role.charAt(0).toUpperCase() + role.slice(1));
      });
    },

    renderTopics(conf) {
      const container = d3.select("#topics-chart");
      container.selectAll("*").remove();

      const node = container.node();
      if (!node) return;

      const width = node.clientWidth || 400;
      const height = 220;
      const margin = { top: 24, right: 10, bottom: 50, left: 40 };

      const svg = container
        .append("svg")
        .attr("width", width)
        .attr("height", height);

      const g = svg
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const rows = [];
      (conf.interventions || []).forEach(d => {
        const topics = d.topics || [];
        topics.forEach(t => {
          rows.push({
            actor_role: d.actor_role,
            topic: t
          });
        });
      });

      if (!rows.length) {
        g.append("text")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight / 2)
          .attr("text-anchor", "middle")
          .text("No topics available for this conference");
        return;
      }

      // Top topics (by count)
      const topicCounts = d3.rollups(
        rows,
        v => v.length,
        d => d.topic
      ).sort((a, b) => d3.descending(a[1], b[1]));

      const topics = topicCounts.slice(0, 8).map(d => d[0]);
      const roles = ["president", "official", "journalist"];

      // Count topics per role
      const counts = {};
      roles.forEach(r => {
        counts[r] = {};
        topics.forEach(t => {
          counts[r][t] = 0;
        });
      });

      rows.forEach(d => {
        if (topics.includes(d.topic) && counts[d.actor_role]) {
          counts[d.actor_role][d.topic] =
            (counts[d.actor_role][d.topic] || 0) + 1;
        }
      });

      const stackedData = roles.map(role => {
        const obj = { role };
        topics.forEach(t => {
          obj[t] = counts[role][t] || 0;
        });
        return obj;
      });

      const x = d3.scaleBand()
        .domain(roles)
        .range([0, innerWidth])
        .padding(0.2);

      const y = d3.scaleLinear()
        .domain([
          0,
          d3.max(stackedData, d => d3.sum(topics, t => d[t])) || 1
        ])
        .nice()
        .range([innerHeight, 0]);

      const color = d3.scaleOrdinal()
        .domain(topics)
        .range(d3.schemeSet3);

      const stack = d3.stack().keys(topics);
      const series = stack(stackedData);

      g.selectAll("g.layer")
        .data(series)
        .join("g")
        .attr("class", "layer")
        .attr("fill", d => color(d.key))
        .selectAll("rect")
        .data(d => d)
        .join("rect")
        .attr("x", d => x(d.data.role))
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]))
        .attr("width", x.bandwidth());

      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(
          d3.axisBottom(x).tickFormat(r =>
            r.charAt(0).toUpperCase() + r.slice(1)
          )
        );

      g.append("g").call(d3.axisLeft(y).ticks(4));

      // Legend
      const legend = svg
        .append("g")
        .attr(
          "transform",
          `translate(${margin.left}, ${height - margin.bottom + 10})`
        );

      topics.forEach((t, i) => {
        const row = legend
          .append("g")
          .attr("transform", `translate(${i * 90}, 0)`);

        row
          .append("rect")
          .attr("width", 8)
          .attr("height", 8)
          .attr("fill", color(t));

        row
          .append("text")
          .attr("x", 12)
          .attr("y", 8)
          .attr("font-size", 9)
          .text(t);
      });
    },

    renderRoleRatio(conf) {
      const container = d3.select("#role-ratio-chart");
      container.selectAll("*").remove();

      const node = container.node();
      if (!node) return;

      const width = node.clientWidth || 400;
      const height = 180;
      const margin = { top: 24, right: 10, bottom: 30, left: 40 };

      const svg = container
        .append("svg")
        .attr("width", width)
        .attr("height", height);

      const g = svg
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const ints = conf.interventions || [];

      const govCount = ints.filter(
        d => d.actor_role === "president" || d.actor_role === "official"
      ).length;
      const jourCount = ints.filter(d => d.actor_role === "journalist").length;

      const data = [
        {
          group: "Government (president + officials)",
          value: govCount
        },
        { group: "Journalists", value: jourCount }
      ];

      const x = d3.scaleBand()
        .domain(data.map(d => d.group))
        .range([0, innerWidth])
        .padding(0.35);

      const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) || 1])
        .nice()
        .range([innerHeight, 0]);

      const color = d3.scaleOrdinal()
        .domain(data.map(d => d.group))
        .range(["#9B2915", "#063A35"]);

      g.selectAll("rect")
        .data(data)
        .join("rect")
        .attr("x", d => x(d.group))
        .attr("y", d => y(d.value))
        .attr("width", x.bandwidth())
        .attr("height", d => innerHeight - y(d.value))
        .attr("fill", d => color(d.group));

      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(
          d3.axisBottom(x).tickFormat(d => d.split(" ")[0]) // short label
        );

      g.append("g").call(d3.axisLeft(y).ticks(4));

      const ratio =
        jourCount === 0
          ? "∞"
          : (govCount / Math.max(jourCount, 1)).toFixed(2);

      svg
        .append("text")
        .attr("x", width - 8)
        .attr("y", margin.top)
        .attr("text-anchor", "end")
        .attr("font-size", 10)
        .text(`Gov / Journalist ratio: ${ratio}`);
    },

    renderStates(conf) {
      const container = d3.select("#states-chart");
      container.selectAll("*").remove();

      const node = container.node();
      if (!node) return;

      const width = node.clientWidth || 400;
      const height = 200;
      const margin = { top: 24, right: 10, bottom: 70, left: 40 };

      const svg = container
        .append("svg")
        .attr("width", width)
        .attr("height", height);

      const g = svg
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const counts = new Map();

      (conf.interventions || []).forEach(d => {
        (d.mentioned_states || []).forEach(s => {
          counts.set(s, (counts.get(s) || 0) + 1);
        });
      });

      let data = Array.from(counts, ([state, value]) => ({ state, value }));
      data.sort((a, b) => d3.descending(a.value, b.value));
      data = data.slice(0, 8); // top 8

      if (!data.length) {
        g.append("text")
          .attr("x", innerWidth / 2)
          .attr("y", innerHeight / 2)
          .attr("text-anchor", "middle")
          .text("No states mentioned in this conference");
        return;
      }

      const x = d3.scaleBand()
        .domain(data.map(d => d.state))
        .range([0, innerWidth])
        .padding(0.3);

      const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.value) || 1])
        .nice()
        .range([innerHeight, 0]);

      g.selectAll("rect")
        .data(data)
        .join("rect")
        .attr("x", d => x(d.state))
        .attr("y", d => y(d.value))
        .attr("width", x.bandwidth())
        .attr("height", d => innerHeight - y(d.value))
        .attr("fill", "#E9B872");

      g.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-35)")
        .style("text-anchor", "end")
        .attr("font-size", 10);

      g.append("g").call(d3.axisLeft(y).ticks(4));
    }
  };

  // -------------------------
  //  MODULE: APP (WIRING)
  // -------------------------
  const ExploreApp = {
    init() {
      if (!ExploreState.hasData()) {
        console.error("Explore: no conferences found on window.conferences");
        return;
      }

      const select = d3.select("#explore-conference-select");
      if (select.empty()) {
        console.error("Explore: missing #explore-conference-select element");
        return;
      }

      // Populate dropdown
      select
        .selectAll("option")
        .data(ExploreState.conferences)
        .join("option")
        .attr("value", d => d.id)
        .text(d => `${d.date} — ${d.title}`);

      const defaultId = ExploreState.getDefaultId();
      ExploreState.setCurrent(defaultId);
      select.property("value", defaultId);

      select.on("change", (event) => {
        const id = event.target.value;
        ExploreState.setCurrent(id);
        this.renderAll();
      });

      // Initial render
      this.renderAll();

      // Make charts responsive
      window.addEventListener("resize", () => {
        this.renderAll();
      });
    },

    renderAll() {
      const conf = ExploreState.getCurrent();
      if (!conf) return;

      ExplorePanels.renderMeta(conf);
      ExplorePanels.renderBehavior(conf);
      ExploreCharts.renderSentiment(conf);
      ExploreCharts.renderTopics(conf);
      ExploreCharts.renderRoleRatio(conf);
      ExploreCharts.renderStates(conf);
    }
  };

  // -------------------------
  //  BOOTSTRAP
  // -------------------------
  document.addEventListener("DOMContentLoaded", () => {
    ExploreApp.init();
  });
})();
