import Lenis from './vendor/lenis/lenis.js';
import {
  MUSCLES, definition, day, minutes, workSets, units, occurrence, sideFactor,
  plannedVolume, observations, routineWorkouts, filterWorkouts, variant,
  addDays, monday, weeksBetween, validateSnapshot, estimatedOneRepMax, pairedExerciseOrder
} from './model.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v, digits = 1) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: digits }).format(v);
const date = (d, options) => new Intl.DateTimeFormat('it-IT', { ...options, timeZone: 'UTC' }).format(new Date(d + 'T12:00Z'));
const short = d => date(d, { day: '2-digit', month: '2-digit' });
const long = d => date(d, { day: 'numeric', month: 'long', year: 'numeric' });
const monthName = d => date(d, { month: 'long', year: 'numeric' });
const empty = message => `<p class="empty-state">${esc(message)}</p>`;
const variantNames = { standard: 'Libero', smith: 'Multipower', bilateral: 'bilaterale', unilateral: 'monolaterale' };
const sideNames = { left: 'Braccio sinistro', right: 'Braccio destro' };
const shoulderDates = ['2026-10-14', '2026-11-11'];
const shoulderNote = 'Piccola lussazione della spalla destra';

let data;
let routines;
let workoutsById;
let filtered = [];
let calendarMonth;
let markedDates = [];
const charts = new Map();
const chartObserver = new ResizeObserver(entries => {
  for (const { target } of entries) {
    const record = charts.get(target);
    if (!record || record.width === target.clientWidth || !target.clientWidth) continue;
    record.width = target.clientWidth;
    drawChart(target, record.rows, record.options);
  }
});

function chart(element, rows, options) {
  charts.set(element, { rows, options, width: element.clientWidth });
  chartObserver.observe(element);
  drawChart(element, rows, options);
}

function markedDateLabels() {
  return markedDates.length ? `<p class="event-dates">${markedDates.map(d =>
    `<time datetime="${d}" title="${shoulderNote}" aria-label="${long(d)}. ${shoulderNote}">${short(d)}</time>`
  ).join('')}</p>` : '';
}

function drawChart(element, rows, {
  title, unit, bars = false, reference, height = 190, zoom = false,
  selected, pointLabel, pointText, onSelect, compareSides = false
}) {
  if (!rows.length) {
    element.innerHTML = empty('Nessuna registrazione nel periodo.') + markedDateLabels();
    return;
  }
  const width = Math.max(240, element.clientWidth);
  const values = rows.map(row => row.value);
  const low = Math.min(...values);
  const high = Math.max(...values, reference ?? 0);
  const stepSize = Math.max(1, zoom ? high * .06 : 0, (high - (zoom ? low : 0)) / 3);
  const magnitude = 10 ** Math.floor(Math.log10(stepSize));
  const step = ([1, 2, 2.5, 5, 10].find(n => n * magnitude >= stepSize) ?? 10) * magnitude;
  const min = zoom ? Math.max(0, Math.floor((low - step / 3) / step) * step) : 0;
  const max = Math.max(min + step, Math.ceil((high + (zoom ? step / 3 : 0)) / step) * step);
  const left = Math.max(32, num(max).length * 7 + 12), right = 14, top = 25, bottom = 28;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const baseline = top + plotHeight;
  const y = value => baseline - (value - min) / (max - min) * plotHeight;
  const time = row => Date.parse(row.startTime ?? row.date);
  const eventTime = d => Date.parse(d + 'T12:00:00Z');
  const eventTimes = markedDates.map(eventTime);
  const from = Math.min(time(rows[0]), ...eventTimes), to = Math.max(time(rows.at(-1)), ...eventTimes);
  const timeX = timestamp => from === to
    ? left + plotWidth / 2
    : left + (timestamp - from) * plotWidth / (to - from);
  const x = (row, i) => bars
    ? left + (i + .5) * plotWidth / rows.length
    : timeX(time(row));
  const pointX = (row, i) => x(row, i) + (compareSides ? (row.side === 'left' ? -6 : 6) : 0);
  const label = (row, i) => pointLabel?.(row, i) ?? `${row.label ?? short(row.date)} · ${num(row.value)} ${unit}${row.note ? ' · ' + row.note : ''}`;
  const eventDescriptions = markedDates.map(d => `${long(d)}. ${shoulderNote}`);
  let content = `<title>${esc(title)}</title><desc>${esc([...rows.map(label), ...eventDescriptions].join('. '))}</desc>`;
  const ticks = Math.round((max - min) / step);
  for (let i = 0; i <= ticks; i++) {
    const value = min + step * i, yy = y(value);
    content += `<line class="grid-line" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/>
      <text x="${left - 8}" y="${yy + 4}" text-anchor="end">${num(value)}</text>`;
  }
  if (compareSides) {
    for (const side of Object.keys(sideNames)) {
      const points = rows.filter(row => row.side === side).map(row => `${pointX(row)},${y(row.value)}`);
      if (points.length > 1) content += `<polyline class="plot-line side-${side}" points="${points.join(' ')}"/>`;
    }
  } else if (!bars && rows.length > 1) {
    const points = rows.map((row, i) => `${x(row, i)},${y(row.value)}`);
    content += `<path class="area" d="M${x(rows[0], 0)},${baseline} L${points.join(' L')} L${x(rows.at(-1), rows.length - 1)},${baseline} Z"/>
      <polyline class="plot-line" points="${points.join(' ')}"/>`;
  }
  if (reference != null) {
    const yy = y(reference);
    content += `<line class="reference" x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"/>
      <text x="${width - right}" y="${yy - 6}" text-anchor="end">Rif. ${num(reference)}</text>`;
  }
  for (const d of markedDates) {
    const week = bars ? rows.findIndex(row => row.date === monday(d)) : -1;
    if (bars && week < 0) continue;
    const xx = bars ? x(rows[week], week) : timeX(eventTime(d));
    content += `<g class="event-marker"><title>${long(d)}. ${shoulderNote}</title>
      <line x1="${xx}" x2="${xx}" y1="${top}" y2="${baseline}"/>
      <circle cx="${xx}" cy="${top - 6}" r="4"/></g>`;
  }
  let previousLabelX = -Infinity;
  let previousPointEnd = 0;
  const widthOf = value => value.length * 7;
  const lastPointStart = pointText
    ? Math.min(x(rows.at(-1), rows.length - 1) - widthOf(pointText(rows.at(-1))) / 2, width - right - widthOf(pointText(rows.at(-1))))
    : width;
  rows.forEach((row, i) => {
    const axisX = x(row, i), xx = pointX(row, i), yy = y(row.value), tooltip = esc(label(row, i));
    if (bars) {
      const bar = Math.min(38, plotWidth / rows.length * .56);
      const barHeight = Math.max(2, baseline - yy);
      content += `<rect class="plot-bar${row.partial ? ' partial' : ''}" x="${xx - bar / 2}" y="${baseline - barHeight}" width="${bar}" height="${barHeight}" rx="${Math.min(4, barHeight / 2)}"><title>${tooltip}</title></rect>`;
    } else if (onSelect) {
      const marker = row.orderChanged
        ? `<rect class="plot-dot" x="${xx - 4}" y="${yy - 4}" width="8" height="8" transform="rotate(45 ${xx} ${yy})"/>`
        : `<circle class="plot-dot" cx="${xx}" cy="${yy}" r="4.5"/>`;
      content += `<g class="chart-point${compareSides ? ` side-${row.side}` : ''}" data-point="${i}" tabindex="0" role="button" aria-label="${tooltip}" aria-pressed="${i === selected}">
        <circle cx="${xx}" cy="${yy}" r="${compareSides ? 10 : 12}" fill="transparent"/>
        ${marker}<title>${tooltip}</title></g>`;
    } else {
      content += `<circle class="plot-dot" cx="${xx}" cy="${yy}" r="4.5"><title>${tooltip}</title></circle>`;
    }
    const last = i === rows.length - 1;
    if (pointText) {
      const text = pointText(row), labelWidth = widthOf(text);
      const start = Math.max(left, Math.min(xx - labelWidth / 2, width - right - labelWidth));
      if (last || (start >= previousPointEnd && start + labelWidth + 6 <= lastPointStart)) {
        content += `<text class="value-label series-label" x="${start + labelWidth / 2}" y="${yy - 11}" text-anchor="middle" aria-hidden="true">${esc(text)}</text>`;
        previousPointEnd = start + labelWidth + 6;
      }
    }
    const labelGap = row.partial ? 55 : 48;
    if (last || (axisX - previousLabelX > labelGap && x(rows.at(-1), rows.length - 1) - axisX > labelGap)) {
      previousLabelX = axisX;
      const anchor = axisX < left + 16 ? 'start' : axisX > width - right - 16 ? 'end' : 'middle';
      content += `<text x="${axisX}" y="${height - 7}" text-anchor="${anchor}">${esc(row.label ?? short(row.date))}</text>`;
      if (bars && rows.length <= 8) content += `<text class="value-label" x="${xx}" y="${yy - 7}" text-anchor="middle">${num(row.value)}</text>`;
    }
  });
  element.innerHTML = `<svg width="${width}" height="${height}" role="${onSelect ? 'group' : 'img'}" aria-label="${esc(title)}">${content}</svg>` + markedDateLabels();
  if (onSelect) {
    element.querySelectorAll('[data-point]').forEach(point => {
      const select = () => {
        const index = Number(point.dataset.point);
        charts.get(element).options.selected = index;
        element.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
        point.setAttribute('aria-pressed', 'true');
        onSelect(index);
      };
      point.addEventListener('click', select);
      point.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
    });
  }
}

function monthOffset(month, offset) {
  const d = new Date(month + 'T12:00Z');
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 10);
}

function calendar() {
  const start = $('start-date').value, end = $('end-date').value;
  const monthEnd = addDays(monthOffset(calendarMonth, 1), -1);
  const weeks = weeksBetween(calendarMonth, monthEnd);
  const byDay = new Map();
  for (const workout of filtered) {
    const d = day(workout);
    if (d < calendarMonth || d > monthEnd) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(workout);
  }
  $('calendar-month').textContent = monthName(calendarMonth);
  const monthCount = [...byDay.values()].reduce((sum, workouts) => sum + workouts.length, 0);
  $('calendar-count').textContent = `${monthCount} ${monthCount === 1 ? 'seduta nel mese' : 'sedute nel mese'}`;
  $('prev-month').disabled = calendarMonth <= start.slice(0, 7) + '-01';
  $('next-month').disabled = monthEnd >= end;
  const days = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const heads = days.map(name => `<div class="calendar-head">${name}</div>`).join('');
  const cells = [];
  for (let d = weeks[0].start; d <= weeks.at(-1).end; d = addDays(d, 1)) {
    const inside = d >= start && d <= end && d >= calendarMonth && d <= monthEnd;
    const marked = d >= calendarMonth && d <= monthEnd && shoulderDates.includes(d);
    const sessions = byDay.get(d) ?? [];
    const buttons = sessions.map(w =>
      `<button type="button" class="session-chip" data-workout="${esc(w.id)}" aria-label="${esc(`${w.title}, ${long(d)}. Apri seduta`)}" title="${esc(w.title)}">${esc(w.title)}</button>`).join('');
    const dateLabel = marked ? ` title="${shoulderNote}" aria-label="${long(d)}. ${shoulderNote}"` : '';
    cells.push(`<div class="day-cell${inside ? '' : ' outside'}${marked ? ' event-day' : ''}"><time datetime="${d}"${dateLabel}>${Number(d.slice(-2))}</time>${buttons}</div>`);
  }
  $('calendar').innerHTML = heads + cells.join('');
}

function sessionCount(count) {
  return `${count} ${count === 1 ? 'seduta' : 'sedute'}`;
}

function durationLabel(total) {
  const rounded = Math.round(total), hours = Math.floor(rounded / 60), mins = rounded % 60;
  return hours ? `${hours} h${mins ? ` ${mins} min` : ''}` : `${mins} min`;
}

function normalizedUnits(w) {
  return w.exercises.flatMap((e, i) => units(e, 7, sideFactor(e, occurrence(w.exercises, i), w.routine_id, data.metadata)));
}

function weeklyCharts() {
  const weeks = weeksBetween($('start-date').value, $('end-date').value);
  const byWeek = new Map(weeks.map(w => [w.start, []]));
  for (const workout of filtered) byWeek.get(monday(day(workout))).push(workout);
  const weekly = weeks.map(w => ({
    date: w.start, label: short(w.start) + (w.partial ? ' *' : ''), partial: w.partial,
    workouts: byWeek.get(w.start)
  }));
  const durations = filtered.map(w => ({ date: day(w), startTime: w.start_time, value: Math.round(minutes(w)), note: w.title }));
  const total = filtered.reduce((sum, w) => sum + minutes(w), 0);
  $('frequency-summary').innerHTML = `<strong>${sessionCount(filtered.length)}</strong><span>nel periodo</span>`;
  $('duration-summary').innerHTML = `<strong>${durationLabel(total)}</strong><span>${filtered.length ? `${durationLabel(total / filtered.length)} di media` : 'nel periodo'}</span>`;
  const target = routines.reduce((sum, r) => sum + (data.metadata.schedule.sessions_per_week[r.id] ?? 0), 0);
  chart($('frequency-chart'), weekly.map(w => ({ ...w, value: w.workouts.length })), {
    title: 'Sedute per settimana', unit: 'sedute', bars: true, reference: target || undefined
  });
  chart($('duration-chart'), durations, { title: 'Durata per seduta', unit: 'min', reference: 75 });
  const workVolume = weekly.map(w => ({
    ...w, value: w.workouts.flatMap(s => normalizedUnits(s)).reduce((sum, set) => sum + set.weight, 0)
  }));
  const totalSets = workVolume.reduce((sum, w) => sum + w.value, 0);
  $('work-volume-summary').innerHTML = `<strong>${num(totalSets)}</strong><span>${totalSets === 1 ? 'serie equivalente' : 'serie equivalenti'} nel periodo</span>`;
  chart($('work-volume-chart'), workVolume, { title: 'Serie di lavoro per settimana', unit: 'serie equivalenti', bars: true });
}

function exerciseName(exercise, i, exercises) {
  const v = variant(exercise, i, exercises);
  const suffix = v !== 'standard' ? variantNames[v] : '';
  return `${definition(exercise).name}${suffix ? ` · ${suffix}` : ''}`;
}

function setLabel(s) {
  const reps = s.rep_range
    ? `${s.rep_range.start ?? '?'}–${s.rep_range.end ?? '?'} rep`
    : Number.isFinite(s.reps) ? `${num(s.reps)} rep`
    : Number.isFinite(s.duration_seconds) ? `${num(s.duration_seconds)} s`
    : Number.isFinite(s.distance_meters) ? `${num(s.distance_meters)} m` : '—';
  return `${s.weight_kg == null ? '' : `${num(s.weight_kg)} kg × `}${reps}`;
}

function routineSummary(routine) {
  const frequency = data.metadata.schedule.sessions_per_week[routine.id] ?? 0;
  const exercises = routine.exercises.length;
  return `${exercises} ${exercises === 1 ? 'esercizio' : 'esercizi'}${frequency ? ` · ${frequency}× a settimana` : ''}`;
}

function routineCard(routine) {
  return `<button class="panel routine-card" type="button" data-routine="${esc(routine.id)}" aria-haspopup="dialog" aria-controls="routine-dialog">
    <span class="routine-title">${esc(routine.title)}</span>
    <span class="section-copy">${routineSummary(routine)}</span>
    <span class="routine-action">Apri scheda</span>
  </button>`;
}

function showRoutine(routine) {
  $('routine-dialog-title').textContent = routine.title;
  $('routine-dialog-meta').textContent = routineSummary(routine);
  const body = $('routine-dialog-body');
  body.innerHTML = `<ol class="routine-exercises">${routine.exercises.map((e, i) => {
    const sets = workSets(e);
    const factor = sideFactor(e, occurrence(routine.exercises, i), routine.id, data.metadata);
    const count = units(e, 7, factor).reduce((sum, set) => sum + set.weight, 0);
    const prescription = [...new Set(sets.map(setLabel))].join(' / ');
    return `<li>
      <div class="routine-exercise-heading">
        <h3>${esc(exerciseName(e, i, routine.exercises))}</h3>
        ${count ? `<span class="unit">${num(count)} serie${factor === .5 ? ' / lato' : ''}</span>` : ''}
      </div>
      <div class="exercise-detail">
        ${prescription ? `<p>${esc(prescription)}</p>` : ''}
        ${e.rest_seconds != null ? `<p>Recupero ${num(e.rest_seconds)} s</p>` : ''}
        ${sets.some(s => s.type === 'failure') ? '<p>Serie marcata a cedimento</p>' : ''}
        ${e.notes ? `<p class="original-note">${esc(e.notes)}</p>` : ''}
      </div>
    </li>`;
  }).join('')}</ol>`;
  $('routine-dialog-progress').dataset.routine = routine.id;
  $('routine-dialog').showModal();
  body.scrollTop = 0;
}

function renderSplit() {
  const count = routines.reduce((sum, r) => sum + (data.metadata.schedule.sessions_per_week[r.id] ?? 0), 0);
  $('split-summary').textContent = `${routines.length} schede · ${sessionCount(count)} a settimana`;
  $('split-grid').innerHTML = routines.map(routineCard).join('');
  $('progress-routine').innerHTML = routines.map(r => `<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('');
}

function progress() {
  for (const element of charts.keys()) {
    if (element.closest('#progress-grid')) {
      chartObserver.unobserve(element);
      charts.delete(element);
    }
  }
  const routine = routines.find(r => r.id === $('progress-routine').value);
  const grid = $('progress-grid');
  if (!routine) {
    grid.innerHTML = empty('Nessuna scheda attiva.');
    return;
  }
  const workouts = routineWorkouts(filtered, routine);
  const entries = routine.exercises.map((e, i) => ({
    e,
    chosenVariant: variant(e, i, routine.exercises),
    name: exerciseName(e, i, routine.exercises),
    plannedOrder: pairedExerciseOrder(routine.exercises, i),
    compareSides: sideFactor(e, occurrence(routine.exercises, i), routine.id, data.metadata) === .5
  }));
  grid.innerHTML = entries.map(({ e, chosenVariant, name }) => {
    const hasSmith = e.exercise_template_id === 'D04AC939' && observations(workouts, e.exercise_template_id, 'smith').length;
    const hasFreeSquat = hasSmith && observations(workouts, e.exercise_template_id, chosenVariant).length;
    return `<article class="panel progress-card">
      <div class="panel-head">
        <h3>${esc(name)}</h3>
        ${hasSmith ? `<label class="variant-select">Variante <select data-variant>
          <option value="standard"${hasFreeSquat ? '' : ' disabled'}>Libero</option>
          <option value="smith"${hasFreeSquat ? '' : ' selected'}>Multipower</option>
        </select></label>` : ''}
      </div>
      <div class="progress-range"></div>
      <p class="order-key chart-note" hidden>Ordine diverso dalla scheda</p>
      <div class="chart progress-chart"></div>
      <div class="point-detail" aria-live="polite"></div>
    </article>`;
  }).join('');
  [...grid.children].forEach((card, i) => {
    const { e, chosenVariant, compareSides, plannedOrder } = entries[i];
    const picker = card.querySelector('[data-variant]');
    const render = () => {
      const v = picker?.value ?? chosenVariant;
      const recorded = compareSides
        ? Object.keys(sideNames)
          .flatMap(side => observations(workouts, e.exercise_template_id, v, side).map(row => ({ ...row, side })))
          .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
        : observations(workouts, e.exercise_template_id, v);
      const rows = recorded.map(row => ({
        ...row, orderChanged: Boolean(plannedOrder && row.pairOrder && row.pairOrder.isFirst !== plannedOrder.isFirst)
      }));
      renderExerciseChart(card, e, rows, v, compareSides);
    };
    picker?.addEventListener('change', render);
    render();
  });
}

function renderExerciseChart(card, exercise, recorded, exerciseVariant, compareSides) {
  const hasLoad = workSets(exercise).some(s => s.weight_kg > 0) || recorded.some(o => o.kg > 0);
  const unit = hasLoad ? 'Massimale stimato (kg)' : 'Ripetizioni';
  const rows = recorded
    .map(o => ({ ...o, value: hasLoad ? estimatedOneRepMax(o.kg, o.reps) : o.reps }))
    .filter(o => Number.isFinite(o.value));
  const maxReps = rows.reduce((max, row) =>
    row.workSeries.reduce((seriesMax, set) => Math.max(seriesMax, set.reps ?? 0), max), 1);
  const series = row => hasLoad ? `${num(row.kg)} kg × ${num(row.reps)}` : `${num(row.reps)} rep`;
  const estimate = row => `${num(row.value)} kg stimati`;
  const orderLabel = row => row.orderChanged ? 'Ordine diverso dalla scheda' : 'Ordine registrato';
  const point = (row, label) => `<span><small>${label} · ${short(row.date)}</small><strong>${series(row)}</strong></span>`;
  const overview = compareSides
    ? Object.entries(sideNames).map(([side, label]) => {
      const latest = rows.findLast(row => row.side === side);
      return `<span class="side-key side-${side}"><small>${label}</small>
        ${latest ? `<strong>${series(latest)}</strong> <small>${short(latest.date)}</small>` : ''}</span>`;
    }).join('')
    : rows.length ? `${rows.length > 1 ? point(rows[0], 'Prima') : ''}${point(rows.at(-1), rows.length > 1 ? 'Ultima' : 'Unica seduta')}` : '';
  card.querySelector('.progress-range').innerHTML = `${overview}<span class="unit">${unit}</span>`;
  card.querySelector('.order-key').hidden = !rows.some(row => row.orderChanged);
  const detail = card.querySelector('.point-detail');
  const inspect = i => {
    const row = rows[i];
    const total = row.volumeLoad == null
      ? `<strong>${num(row.totalReps)}</strong> ripetizioni registrate`
      : `Volume di carico${row.volumeComplete ? '' : ' registrato'} · <strong>${num(row.volumeLoad)} kg·rep</strong>`;
    detail.innerHTML = `<div class="point-detail-head">
      <div><strong>${compareSides ? `${sideNames[row.side]} · ` : ''}${short(row.date)} · ${series(row)}</strong>${hasLoad ? ` · ${estimate(row)}` : ''}${row.rpe == null ? '' : ` · RPE ${num(row.rpe)}`}</div>
      <button class="text-button" type="button" data-workout="${esc(row.workoutId)}">Apri seduta</button>
      </div>
      ${row.pairOrder ? `<p>${orderLabel(row)} · ${esc(row.pairOrder.label)}</p>` : ''}
      <p>${total}</p>
      <ol class="set-bars${compareSides ? ` side-${row.side}` : ''}" role="list" aria-label="Serie di lavoro">
        ${row.workSeries.map((set, index) => `<li>
          <span>Serie ${index + 1}</span>
          <span class="set-bar-track" aria-hidden="true"><span style="width:${(set.reps ?? 0) / maxReps * 100}%"></span></span>
          <span class="set-bar-value">${esc(setLabel(set))}</span>
        </li>`).join('')}
      </ol>
      ${row.note.trim() ? `<p class="original-note">${esc(row.note)}</p>` : ''}`;
  };
  detail.hidden = !rows.length;
  if (rows.length) inspect(rows.length - 1);
  else detail.innerHTML = '';
  const name = exerciseVariant === 'smith' ? 'Squat · multipower' : card.querySelector('h3').textContent;
  chart(card.querySelector('.chart'), rows, {
    title: `${name} · ${unit}`, unit, height: 218, zoom: true, selected: rows.length - 1,
    compareSides,
    pointLabel: row => `${compareSides ? `${sideNames[row.side]} · ` : ''}${long(row.date)} · ${series(row)}${hasLoad ? ` · ${estimate(row)}` : ''}${row.pairOrder ? ` · ${orderLabel(row)} · ${row.pairOrder.label}` : ''}`,
    pointText: compareSides ? undefined : series,
    onSelect: inspect
  });
}

function renderPlannedVolume() {
  const plan = plannedVolume(routines, data.metadata);
  const scale = Math.max(20, ...MUSCLES.flatMap(({ id, mev }) => [
    plan[id].total, plan[id].indirect, mev ?? 0
  ])) * 1.1;
  const width = sets => `${sets / scale * 100}%`;

  $('plan-chart').innerHTML = MUSCLES.map(({ id, name, mev }) => {
    const { total, indirect } = plan[id];
    const summary = `${num(total)} serie dirette, ${num(indirect)} serie con lavoro indiretto stimato. MEV della guida: ${mev ?? 'non disponibile'}.`;
    const marker = mev > 0 ? `<span class="mev-tick" style="left:${width(mev)}"></span>` : '';

    return `<li class="volume-row">
      <span class="volume-label">${esc(name)}</span>
      <div class="volume-bars" role="img" aria-label="${esc(summary)}">
        <div class="volume-track"><span class="volume-direct" style="width:${width(total)}"></span>${marker}</div>
        <div class="volume-track"><span class="volume-indirect" style="width:${width(indirect)}"></span></div>
      </div>
      <div class="volume-values" aria-hidden="true"><strong>${num(total)}</strong><span>${num(indirect)}</span></div>
      <span class="volume-mev" aria-hidden="true">MEV ${mev ?? '—'}</span>
    </li>`;
  }).join('');
}

function notesFor(workout) {
  const notes = workout.exercises.flatMap((e, i) => e.notes?.trim() ? [{
    title: exerciseName(e, i, workout.exercises), text: e.notes
  }] : []);
  if (workout.description?.trim()) notes.unshift({ title: 'Nota della seduta', text: workout.description });
  return notes;
}

function renderNotes(notes) {
  return notes.map(note => `<div class="note-block"><strong>${esc(note.title)}</strong><p>${esc(note.text)}</p></div>`).join('');
}

function workoutSeries(workout) {
  return workout.exercises.map((exercise, i) =>
    `<div class="journal-exercise"><strong>${esc(exerciseName(exercise, i, workout.exercises))}</strong>
      <p class="sets-line">${exercise.sets.map(s => esc([
        s.type === 'warmup' ? 'Risc. ' : s.type === 'dropset' ? 'Drop ' : s.type === 'failure' ? 'Ced. ' : '',
        setLabel(s), s.rpe == null ? '' : ` · RPE ${num(s.rpe)}`
      ].join(''))).join(' / ')}</p></div>`
  ).join('');
}

function showWorkout(workout) {
  const notes = notesFor(workout);
  const count = normalizedUnits(workout).reduce((sum, set) => sum + set.weight, 0);
  $('workout-dialog-title').textContent = workout.title;
  $('workout-dialog-meta').textContent = `${long(day(workout))} · ${durationLabel(minutes(workout))} · ${num(count)} serie di lavoro`;
  $('workout-dialog-body').innerHTML =
    `${notes.length ? renderNotes(notes) : '<p class="section-copy">Nessuna nota in questa seduta.</p>'}
    <details class="method-detail"><summary>Tutte le serie</summary>${workoutSeries(workout)}</details>
    <p class="microcopy"><a href="https://hevy.com/workout/${encodeURIComponent(workout.id)}" target="_blank" rel="noreferrer">Apri su Hevy</a></p>`;
  $('workout-dialog').showModal();
}

function journal() {
  const notesOnly = $('notes-only').checked;
  const workouts = [...filtered].reverse().map(w => ({ workout: w, notes: notesFor(w) }))
    .filter(row => !notesOnly || row.notes.length);
  $('journal-list').innerHTML = workouts.length ? workouts.map(({ workout: w, notes }) => `
    <article class="panel journal-card">
      <div class="panel-head"><h3>${esc(w.title)}</h3><time class="unit" datetime="${day(w)}">${long(day(w))}</time></div>
      ${notes.length ? renderNotes(notes) : '<p class="section-copy">Nessuna nota.</p>'}
      <button class="text-button" type="button" data-workout="${esc(w.id)}">Apri seduta</button>
    </article>`).join('') : empty(notesOnly ? 'Nessuna nota nel periodo.' : 'Nessuna seduta nel periodo.');
}

function render() {
  const start = $('start-date').value, end = $('end-date').value;
  const status = $('range-status');
  if (!start || !end || start > end) {
    status.textContent = 'Seleziona un intervallo di date valido.';
    status.hidden = false;
    return;
  }
  status.hidden = end <= data.metadata.captured_at;
  status.textContent = status.hidden ? '' : `Dati disponibili fino al ${long(data.metadata.captured_at)}.`;
  const firstMonth = start.slice(0, 7) + '-01', lastMonth = end.slice(0, 7) + '-01';
  if (!calendarMonth || calendarMonth < firstMonth || calendarMonth > lastMonth) calendarMonth = lastMonth;
  filtered = filterWorkouts(data.workouts, start, end);
  markedDates = shoulderDates.filter(d => d >= start && d <= end);
  $('plan-event-dates').innerHTML = markedDateLabels();
  calendar();
  weeklyCharts();
  progress();
  journal();
}

function initScrollMotion() {
  const title = document.querySelector('.overview-intro h1');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lenis;
  const updateTitle = ({ scroll }) => {
    const offset = Math.max(0, Math.min(scroll * .16, 24));
    title.style.setProperty('--hero-shift', offset + 'px');
  };
  const configure = () => {
    lenis?.destroy();
    lenis = undefined;
    title.style.removeProperty('--hero-shift');
    if (preference.matches) return;
    lenis = new Lenis({ autoRaf: true, autoToggle: true, anchors: true });
    lenis.on('scroll', updateTitle);
    updateTitle(lenis);
  };
  preference.addEventListener('change', configure);
  configure();
}

async function init() {
  try {
    const response = await fetch('./data/snapshot.json');
    if (!response.ok) throw new Error(`Dati non disponibili (${response.status})`);
    data = await response.json();
    validateSnapshot(data);
    workoutsById = new Map(data.workouts.map(w => [w.id, w]));
    const byRoutineId = new Map(data.routines.map(r => [r.id, r]));
    routines = data.metadata.active_routine_ids.map(id => byRoutineId.get(id)).filter(Boolean);
    const days = data.workouts.map(day).sort();
    const earliest = days[0] ?? data.metadata.captured_at;
    const latest = days.at(-1) ?? data.metadata.captured_at;
    $('snapshot-date').textContent = `Dati Hevy aggiornati al ${long(data.metadata.captured_at)}`;
    $('source-summary').textContent = `${data.workouts.length} allenamenti e ${data.routines.length} routine Hevy. Copertura dal ${long(earliest)} al ${long(latest)}.`;
    for (const id of ['start-date', 'end-date']) {
      $(id).min = earliest;
      $(id).max = data.metadata.captured_at;
      $(id).addEventListener('change', render);
    }
    const defaultStart = '2026-10-21';
    $('start-date').value = defaultStart < earliest ? earliest : defaultStart > latest ? latest : defaultStart;
    $('end-date').value = latest;

    renderSplit();
    renderPlannedVolume();
    const latestWorkout = filterWorkouts(data.workouts, earliest, latest).at(-1);
    const recentRoutine = latestWorkout && routines.find(r => routineWorkouts([latestWorkout], r).length);
    if (recentRoutine) $('progress-routine').value = recentRoutine.id;
    render();
    initScrollMotion();

    for (const [id, offset] of [['prev-month', -1], ['next-month', 1]]) {
      $(id).addEventListener('click', () => {
        calendarMonth = monthOffset(calendarMonth, offset);
        calendar();
      });
    }
    $('progress-routine').addEventListener('change', progress);
    $('split-grid').addEventListener('click', event => {
      const button = event.target.closest('[data-routine]');
      const routine = button && routines.find(r => r.id === button.dataset.routine);
      if (routine) {
        button.focus();
        showRoutine(routine);
      }
    });
    $('routine-dialog-progress').addEventListener('click', event => {
      $('routine-dialog').close();
      const picker = $('progress-routine');
      picker.value = event.currentTarget.dataset.routine;
      progress();
      picker.focus({ preventScroll: true });
    });
    $('main').addEventListener('click', event => {
      const button = event.target.closest('[data-workout]');
      const workout = button && workoutsById.get(button.dataset.workout);
      if (workout) showWorkout(workout);
    });
    $('notes-only').addEventListener('change', journal);
    $('export-data').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gym-dashboard-snapshot-${data.metadata.captured_at}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  } catch (error) {
    $('load-error').hidden = false;
    $('load-error').textContent = `Impossibile caricare la dashboard. ${error.message}`;
  }
}
init();
