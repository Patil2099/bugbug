// TODO: On click, show previous components affected by similar patches.
// TODO: On click, show previous bugs caused by similar patches.

import localForage from "localforage";
import { Temporal } from "proposal-temporal/lib/index.mjs";
import ApexCharts from "apexcharts";
import {
  getPlainDate,
  TESTING_TAGS,
  featureMetabugs,
  landingsData,
  Counter,
  getSummaryData,
  renderChart,
  summarizeCoverage,
  setupOptions,
  allBugTypes,
  getOption,
  getFilteredBugSummaries,
} from "./common.js";

localForage.config({
  driver: localForage.INDEXEDDB,
  name: "bugbug-index",
});

const HIGH_RISK_COLOR = "rgb(255, 13, 87)";
const MEDIUM_RISK_COLOR = "darkkhaki";
const LOW_RISK_COLOR = "green";

let sortBy = ["Date", "DESC"];
let resultSummary = document.getElementById("result-summary");
let resultGraphs = document.getElementById("result-graphs");
let metabugsDropdown = document.querySelector("#featureMetabugs");

let bugDetails = document.querySelector("#bug-details");
// TODO: port this to an option maybe
async function buildMetabugsDropdown() {
  metabugsDropdown.addEventListener("change", () => {
    setOption("metaBugID", metabugsDropdown.value);
    renderUI();
  });
  let bugs = await featureMetabugs;
  metabugsDropdown.innerHTML = `<option value="" selected>Choose a feature metabug</option>`;
  for (let bug of bugs) {
    let option = document.createElement("option");
    option.setAttribute("value", bug.id);
    option.textContent = bug.summary;
    metabugsDropdown.append(option);
  }
}

function addRow(bugSummary) {
  let table = document.getElementById("table");

  let row = table.insertRow(table.rows.length);

  let bug_column = row.insertCell(0);
  let bug_link = document.createElement("a");
  bug_link.textContent = `Bug ${bugSummary["id"]}`;
  bug_link.href = `https://bugzilla.mozilla.org/show_bug.cgi?id=${bugSummary["id"]}`;
  bug_link.target = "_blank";
  bug_column.append(bug_link);
  bug_column.append(document.createTextNode(` - ${bugSummary["summary"]}`));

  let components_percentages = Object.entries(
    bugSummary["most_common_regression_components"]
  );
  if (components_percentages.length > 0) {
    let component_container = document.createElement("div");
    component_container.classList.add("desc-box");
    bug_column.append(component_container);
    components_percentages.sort(
      ([component1, percentage1], [component2, percentage2]) =>
        percentage2 - percentage1
    );
    component_container.append(
      document.createTextNode("Most common regression components:")
    );
    let component_list = document.createElement("ul");
    for (let [component, percentage] of components_percentages.slice(0, 3)) {
      let component_list_item = document.createElement("li");
      component_list_item.append(
        document.createTextNode(
          `${component} - ${Math.round(100 * percentage)}%`
        )
      );
      component_list.append(component_list_item);
    }
    component_container.append(component_list);
  }

  /*<hr>
          The patches have a high chance of causing regressions of type <b>crash</b> and <b>high severity</b>.
          <br><br>
          The patches could affect the <b>Search</b> and <b>Bookmarks</b> features.
          <br><br>
          Examples of previous bugs caused by similar patches:
          <ul>
            <li>Bug 1 - Can"t bookmark pages</li>
            <li>Bug 7 - Search doesn"t work anymore <span style="background-color:gold;color:yellow;">STR</span></li>
          </ul>*/

  let date_column = row.insertCell(1);
  date_column.textContent = bugSummary.date;

  let testing_tags_column = row.insertCell(2);
  testing_tags_column.classList.add("testing-tags");
  let testing_tags_list = document.createElement("ul");
  for (let commit of bugSummary.commits) {
    let testing_tags_list_item = document.createElement("li");
    if (!commit.testing) {
      testing_tags_list_item.append(document.createTextNode("unknown"));
    } else {
      testing_tags_list_item.append(
        document.createTextNode(TESTING_TAGS[commit.testing].label)
      );
    }
    testing_tags_list.append(testing_tags_list_item);
  }
  testing_tags_column.append(testing_tags_list);

  let coverage_column = row.insertCell(3);
  let [lines_added, lines_covered, lines_unknown] = summarizeCoverage(
    bugSummary
  );
  if (lines_added != 0) {
    if (lines_unknown != 0) {
      coverage_column.textContent = `${lines_covered}-${
        lines_covered + lines_unknown
      } of ${lines_added}`;
    } else {
      coverage_column.textContent = `${lines_covered} of ${lines_added}`;
    }
  } else {
    coverage_column.textContent = "";
  }

  let risk_list = document.createElement("ul");
  let risk_column = row.insertCell(4);

  let risk_text = document.createElement("span");
  risk_text.textContent = `${bugSummary.risk_band} risk`;
  if (bugSummary.risk_band == "l") {
    // Lower than average risk.
    risk_text.style.color = LOW_RISK_COLOR;
    risk_text.textContent = "Lower";
  } else if (bugSummary.risk_band == "a") {
    // Average risk.
    risk_text.style.color = MEDIUM_RISK_COLOR;
    risk_text.textContent = "Average";
  } else if (bugSummary.risk_band == "h") {
    // Higher than average risk.
    risk_text.style.color = HIGH_RISK_COLOR;
    risk_text.textContent = "Higher";
  } else if (bugSummary.risk_band == null) {
    // No risk available (there are no commits associated to the bug).
    risk_text.textContent = "N/A";
  } else {
    throw new Exception("Unknown risk band");
  }

  risk_column.append(risk_text);
}

function renderTestingChart(chartEl, bugSummaries) {
  let testingCounts = new Counter();
  bugSummaries.forEach((summary) => {
    summary.commits.forEach((commit) => {
      if (!commit.testing) {
        testingCounts.unknown++;
      } else {
        testingCounts[commit.testing] = testingCounts[commit.testing] + 1;
      }
    });
  });

  let categories = [];
  let colors = [];
  let data = [];
  for (let tag in testingCounts) {
    categories.push(TESTING_TAGS[tag].label);
    data.push(testingCounts[tag]);
    colors.push(TESTING_TAGS[tag].color);
  }

  var options = {
    series: [
      {
        name: "Tags",
        data,
      },
    ],
    chart: {
      height: 150,
      type: "bar",
    },
    plotOptions: {
      bar: {
        dataLabels: {
          position: "top", // top, center, bottom
        },
      },
    },

    xaxis: {
      categories,
      // position: "bottom",
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      labels: {
        show: false,
      },
    },
  };

  var chart = new ApexCharts(chartEl, options);
  chart.render();
}

async function renderRiskChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter(
    (bugSummary) => bugSummary.risk_band !== null
  );

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.date),
        getPlainDate(minSummary.date)
      ) < 0
        ? summary
        : minSummary
    ).date
  );

  // Enforce up to 2 months history, earlier patches are in the model's training set.
  let twoMonthsAgo = Temporal.now
    .plainDateISO()
    .subtract(new Temporal.Duration(0, 2));
  if (Temporal.PlainDate.compare(twoMonthsAgo, minDate) < 0) {
    minDate = twoMonthsAgo;
  }

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, summary) => {
      if (summary.risk_band == "l") {
        counterObj.low += 1;
      } else if (summary.risk_band == "a") {
        counterObj.medium += 1;
      } else {
        counterObj.high += 1;
      }
    }
  );

  let categories = [];
  let high = [];
  let medium = [];
  let low = [];
  for (let date in summaryData) {
    categories.push(date);
    low.push(summaryData[date].low);
    medium.push(summaryData[date].medium);
    high.push(summaryData[date].high);
  }

  renderChart(
    chartEl,
    [
      {
        name: "Higher",
        data: high,
      },
      {
        name: "Average",
        data: medium,
      },
      {
        name: "Lower",
        data: low,
      },
    ],
    categories,
    "Evolution of lower/average/higher risk changes",
    "# of patches"
  );
}

async function renderRegressionsChart(chartEl, bugSummaries) {
  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      if (bug.regression) {
        counterObj.regressions += 1;
        if (bug.fixed) {
          counterObj.fixed_regressions += 1;
        }
      }
    },
    null,
    (summary) => summary.creation_date
  );

  let categories = [];
  let regressions = [];
  let fixed_regressions = [];
  for (let date in summaryData) {
    categories.push(date);
    regressions.push(summaryData[date].regressions);
    fixed_regressions.push(summaryData[date].fixed_regressions);
  }

  renderChart(
    chartEl,
    [
      {
        name: "Regressions",
        data: regressions,
      },
      {
        name: "Fixed regressions",
        data: fixed_regressions,
      },
    ],
    categories,
    "Number of regressions",
    "# of regressions"
  );
}

async function renderTypesChart(chartEl, bugSummaries) {
  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      for (const type of bug.types) {
        counterObj[type] += 1;
      }
    },
    null,
    (summary) => summary.creation_date
  );

  let all_series = [];
  for (let type of allBugTypes) {
    if (type == "unknown") {
      continue;
    }

    all_series.push({
      name: type,
      data: [],
    });
  }

  let categories = [];
  for (let date in summaryData) {
    categories.push(date);
    for (let series of all_series) {
      series["data"].push(summaryData[date][series["name"]]);
    }
  }

  renderChart(
    chartEl,
    all_series,
    categories,
    "Number of bugs by type",
    "# of bugs"
  );
}

async function renderFixTimesChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter((bugSummary) => bugSummary.date !== null);

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      counterObj.fix_time += getPlainDate(bug.creation_date).until(
        getPlainDate(bug.date),
        { largestUnit: "days" }
      ).days;
      counterObj.bugs += 1;
    },
    null,
    (summary) => summary.creation_date
  );

  let categories = [];
  let average_fix_times = [];
  for (let date in summaryData) {
    categories.push(date);
    average_fix_times.push(
      Math.ceil(summaryData[date].fix_time / summaryData[date].bugs)
    );
  }

  renderChart(
    chartEl,
    [
      {
        name: "Average fix time",
        data: average_fix_times,
      },
    ],
    categories,
    "Average fix time",
    "Time"
  );
}

async function renderTimeToBugChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter(
    (bugSummary) => bugSummary.time_to_bug !== null
  );

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      counterObj.time_to_bug += bug.time_to_bug;
      counterObj.bugs += 1;
    },
    null,
    (summary) => summary.creation_date
  );

  let categories = [];
  let average_time_to_bug = [];
  for (let date in summaryData) {
    categories.push(date);
    average_time_to_bug.push(
      Math.ceil(summaryData[date].time_to_bug / summaryData[date].bugs)
    );
  }

  renderChart(
    chartEl,
    [
      {
        name: "Average time to bug (in days)",
        data: average_time_to_bug,
      },
    ],
    categories,
    "Average time to bug (in days)",
    "Time"
  );
}

async function renderTimeToConfirmChart(chartEl, bugSummaries) {
  bugSummaries = bugSummaries.filter(
    (bugSummary) => bugSummary.time_to_confirm !== null
  );

  if (bugSummaries.length == 0) {
    return;
  }

  let minDate = getPlainDate(
    bugSummaries.reduce((minSummary, summary) =>
      Temporal.PlainDate.compare(
        getPlainDate(summary.creation_date),
        getPlainDate(minSummary.creation_date)
      ) < 0
        ? summary
        : minSummary
    ).creation_date
  );

  let summaryData = await getSummaryData(
    bugSummaries,
    getOption("grouping"),
    minDate,
    (counterObj, bug) => {
      counterObj.time_to_confirm += bug.time_to_confirm;
      counterObj.bugs += 1;
    },
    null,
    (summary) => summary.creation_date
  );

  let categories = [];
  let average_time_to_confirm = [];
  for (let date in summaryData) {
    categories.push(date);
    average_time_to_confirm.push(
      Math.ceil(summaryData[date].time_to_confirm / summaryData[date].bugs)
    );
  }

  renderChart(
    chartEl,
    [
      {
        name: "Average time to confirm (in hours)",
        data: average_time_to_confirm,
      },
    ],
    categories,
    "Average time to confirm (in hours)",
    "Time"
  );
}

async function renderTable(bugSummaries) {
  let table = document.getElementById("table");
  while (table.rows.length > 1) {
    table.deleteRow(table.rows.length - 1);
  }
  for (let bugSummary of bugSummaries.filter((summary) => summary.date)) {
    addRow(bugSummary);
  }
}

async function renderSummary(bugSummaries) {
  let metaBugID = getOption("metaBugID");

  let changesets = [];
  if (bugSummaries.length) {
    changesets = bugSummaries
      .map((summary) => summary.commits.length)
      .reduce((a, b) => a + b);
  }

  let bugText = metaBugID ? `For bug ${metaBugID}: ` : ``;
  let summaryText = `${bugText}There are ${bugSummaries.length} bugs with ${changesets} changesets.`;
  resultSummary.textContent = summaryText;

  resultGraphs.textContent = "";
  let testingChartEl = document.createElement("div");
  resultGraphs.append(testingChartEl);
  renderTestingChart(testingChartEl, bugSummaries);

  let riskChartEl = document.createElement("div");
  resultGraphs.append(riskChartEl);
  await renderRiskChart(riskChartEl, bugSummaries);

  let regressionsChartEl = document.createElement("div");
  resultGraphs.append(regressionsChartEl);
  await renderRegressionsChart(regressionsChartEl, bugSummaries);

  let typesChartEl = document.createElement("div");
  resultGraphs.append(typesChartEl);
  await renderTypesChart(typesChartEl, bugSummaries);

  let fixTimesChartEl = document.createElement("div");
  resultGraphs.append(fixTimesChartEl);
  await renderFixTimesChart(fixTimesChartEl, bugSummaries);

  let timeToBugChartEl = document.createElement("div");
  resultGraphs.append(timeToBugChartEl);
  await renderTimeToBugChart(timeToBugChartEl, bugSummaries);

  let timeToConfirmChartEl = document.createElement("div");
  resultGraphs.append(timeToConfirmChartEl);
  await renderTimeToConfirmChart(timeToConfirmChartEl, bugSummaries);
}

async function renderUI(rerenderSummary = true) {
  const bugSummaries = await getFilteredBugSummaries();

  let sortFunction = null;
  if (sortBy[0] == "Date") {
    sortFunction = function (a, b) {
      return Temporal.PlainDate.compare(
        getPlainDate(a.date ? a.date : a.creation_date),
        getPlainDate(b.date ? b.date : b.creation_date)
      );
    };
  } else if (sortBy[0] == "Riskiness") {
    sortFunction = function (a, b) {
      if (a.risk_band == b.risk_band) {
        return 0;
      } else if (
        a.risk_band == "h" ||
        (a.risk_band == "a" && b.risk_band == "l")
      ) {
        return 1;
      } else {
        return -1;
      }
    };
  } else if (sortBy[0] == "Bug") {
    sortFunction = function (a, b) {
      return a.id - b.id;
    };
  } else if (sortBy[0] == "Coverage") {
    sortFunction = function (a, b) {
      let [lines_added_a, lines_covered_a, lines_unknown_a] = summarizeCoverage(
        a
      );
      let [lines_added_b, lines_covered_b, lines_unknown_b] = summarizeCoverage(
        b
      );

      let uncovered_a = lines_added_a - (lines_covered_a + lines_unknown_a);
      let uncovered_b = lines_added_b - (lines_covered_b + lines_unknown_b);

      if (uncovered_a == uncovered_b) {
        return lines_added_a - lines_added_b;
      }

      return uncovered_a - uncovered_b;
    };
  }

  if (sortFunction) {
    if (sortBy[1] == "DESC") {
      bugSummaries.sort((a, b) => -sortFunction(a, b));
    } else {
      bugSummaries.sort(sortFunction);
    }
  }

  if (rerenderSummary) {
    await renderSummary(bugSummaries);
  }

  if (bugDetails.open) {
    await renderTable(bugSummaries);
  }
}

function setTableHeaderHandlers() {
  const table = document.getElementById("table");
  const elems = table.querySelectorAll("th");
  for (let elem of elems) {
    elem.onclick = function () {
      if (sortBy[0] == elem.textContent) {
        if (sortBy[1] == "DESC") {
          sortBy[1] = "ASC";
        } else if (sortBy[1] == "ASC") {
          sortBy[1] = "DESC";
        }
      } else {
        sortBy[0] = elem.textContent;
        sortBy[1] = "DESC";
      }
      renderUI(false);
    };
  }
}

(async function init() {
  buildMetabugsDropdown();

  setTableHeaderHandlers();

  await setupOptions(renderUI);

  let toggle = await localForage.getItem("detailsToggle");
  if (toggle) {
    bugDetails.open = true;
  }
  bugDetails.addEventListener("toggle", async () => {
    await localForage.setItem("detailsToggle", bugDetails.open);
    renderUI(false);
  });

  renderUI();
})();
