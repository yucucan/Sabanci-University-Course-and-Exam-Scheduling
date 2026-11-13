/* Classroom occupancy and room-fit prototype. No remote data or optimizer is used. */
'use strict';

const roomView = {
  types: [], campus: '', building: '', minSeats: 0,
  day: '', start: '08:40', end: '19:30', status: '', query: '',
  weekends: false, selectedSlot: null
};
const planningView = {session: '', requiredType: '', spaceWeight: 70};
const dayCodes = () => days.map(day => day.toUpperCase());
const roomHref = code => '#occupancy/room/' + encodeURIComponent(code);
const clock = minute => String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
const overlaps = (start, end, otherStart, otherEnd) => start < otherEnd && otherStart < end;
const percentage = (part, total) => total ? Math.round(part / total * 100) : 0;
const roomTitle = type => type === 'Amphitheater' ? 'Auditorium / Amphitheater' : type === 'Computer Laboratory' ? 'Computer room / Laboratory' : type;
const sessionKey = session => `${session.courseIndex}:${session.kind}:${session.sessionIndex}${session.meetingIndex?`:${session.meetingIndex}`:''}`;

function windowValid(start, end) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && start < end;
}

function roomsInScope() {
  return data.classrooms.filter(room =>
    (!roomView.types.length || roomView.types.includes(room.type)) &&
    (!roomView.campus || room.campus === roomView.campus) &&
    (!roomView.building || room.building === roomView.building) &&
    room.capacity >= Number(roomView.minSeats || 0)
  );
}

function scheduledSessions() { return allSessions().filter(isScheduled); }

// Endpoints are exclusive: a class ending at 10:30 does not occupy 10:30–11:00.
// A room is free only when the entire requested interval is free.
function roomWindow(room, day, start, end, excludeKey = '') {
  if(!day){
    const states=dayCodes().map(d=>roomWindow(room,d,start,end,excludeKey));
    return {sessions:states.flatMap(s=>s.sessions),unavailable:states.flatMap(s=>s.unavailable),occupied:states.some(s=>s.occupied),blocked:states.some(s=>s.blocked),free:states.every(s=>s.free),peakDemand:Math.max(0,...states.map(s=>s.peakDemand)),seatFill:Math.max(0,...states.map(s=>s.seatFill)),collision:states.some(s=>s.collision)};
  }
  const from = minutes(start), to = minutes(end);
  const sessions = scheduledSessions().filter(session => session.classroom === room.code &&
    session.day === day && sessionKey(session) !== excludeKey &&
    overlaps(from, to, minutes(session.start), minutes(session.end)));
  const dayIndex = dayCodes().indexOf(day);
  const unavailable = unavailableHours(room,dayIndex,start,end);
  // Compute peak simultaneous demand, not the sum of sequential classes in a slot.
  const events = sessions.flatMap(session => [
    [Math.max(from, minutes(session.start)), session.demand],
    [Math.min(to, minutes(session.end)), -session.demand]
  ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0, peakDemand = 0;
  events.forEach(([, delta]) => { current += delta; peakDemand = Math.max(peakDemand, current); });
  const collision = sessions.some((a, i) => sessions.slice(i + 1).some(b => overlaps(minutes(a.start), minutes(a.end), minutes(b.start), minutes(b.end))));
  return {sessions, unavailable, occupied: sessions.length > 0, blocked: unavailable.length > 0,
    free: sessions.length === 0 && unavailable.length === 0, peakDemand,
    seatFill: percentage(peakDemand, room.capacity), collision};
}

function slotOccupancy(rooms, day, start, end) {
  const states = rooms.map(room => ({room, ...roomWindow(room, day, start, end)}));
  const occupied = states.filter(state => state.occupied).length;
  return {states, occupied, free: states.filter(state => state.free).length,
    blocked: states.filter(state => state.blocked && !state.occupied).length,
    percent: percentage(occupied, rooms.length)};
}

function selectControl(id, label, values, value, placeholder) {
  return `<label>${label}<select id="${id}"><option value="">${placeholder}</option>${values.map(item => {
    const [v, text] = Array.isArray(item) ? item : [item, item];
    return `<option value="${esc(v)}" ${value === v ? 'selected' : ''}>${esc(text)}</option>`;
  }).join('')}</select></label>`;
}

function scopeFilters(extra = '') {
  const buildings = data.buildings.filter(building => !roomView.campus || building.campus === roomView.campus);
  return `<section class="panel scope-panel"><div class="panel-content">
    <div class="filter-bar">
      ${selectControl('room-campus', 'Campus', data.campuses.map(c => c.name), roomView.campus, 'All campuses')}
      ${selectControl('room-building', 'Building', buildings.map(b => b.name), roomView.building, 'All buildings')}
      <label>Minimum seats<input id="room-min-seats" type="number" min="0" step="1" value="${roomView.minSeats}" placeholder="Any capacity"></label>
      ${extra}<button id="reset-room-filters">Clear filters</button>
    </div>
    <fieldset class="type-filters"><legend>Classroom types <span>Choose any combination · none selected means all types</span></legend>
      ${data.classroomTypes.map(type => `<label class="type-chip"><input type="checkbox" data-room-type="${esc(type.name)}" ${roomView.types.includes(type.name) ? 'checked' : ''}><span>${esc(roomTitle(type.name))}</span></label>`).join('')}
    </fieldset>
  </div></section>`;
}

function statCards(items) {
  return `<div class="stats occupancy-stats">${items.map(([label, value, note]) => `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('')}</div>`;
}

function unscheduledNotice() {
  const unscheduled = allSessions().filter(session => !isScheduled(session));
  return unscheduled.length ? `<div class="notice">${unscheduled.length} session(s) have no day/time and are excluded from occupancy. <a href="#timetable">Review unassigned sessions →</a></div>` : '';
}

function timeBounds(sessions = scheduledSessions()) {
  const values = sessions.flatMap(session => [minutes(session.start), minutes(session.end)]);
  // Keep a recognizable teaching-day grid and extend it for early/late classes.
  return {start: Math.min(520, ...values.map(v => Math.floor((v-40) / 60) * 60+40)), end: Math.max(1170, ...values)};
}

function teachingHeatmapRows(visibleDays) {
  const rows = new Map();
  const standard = usesSabanciBlocks();
  for (const {day,start,end} of data.timeStructure) {
    if (!visibleDays.includes(day) || !windowValid(start,end) || (standard && teachingBlockCount(start,end)!==1)) continue;
    const key = `${start}-${end}`;
    if (!rows.has(key)) rows.set(key,{start,end,days:new Set()});
    rows.get(key).days.add(day.toUpperCase());
  }
  return [...rows.values()].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
}

function occupancyPage() {
  const rooms = roomsInScope();
  const visibleDays = roomView.weekends ? days : days.slice(0,5);
  const slots = teachingHeatmapRows(visibleDays);
  const cells = slots.flatMap(slot => [...slot.days].map(day=>slotOccupancy(rooms,day,slot.start,slot.end)));
  const totalRoomSlots = rooms.length * cells.length;
  const busyRoomSlots = cells.reduce((total, cell) => total + cell.occupied, 0);
  const peak = cells.reduce((highest, cell) => Math.max(highest, cell.percent), 0);
  main.innerHTML = heading('Room occupancy', 'See how full each time slot is, then open a classroom’s weekly schedule.') +
    `<div class="view-switch"><a class="selected" href="#occupancy">Campus heatmap</a><a href="#classrooms">Find a classroom</a></div>` +
    scopeFilters() +
    statCards([['Matching rooms', rooms.length, `${rooms.reduce((total, room) => total + room.capacity, 0)} seats in the selected scope`],
      ['Occupied room slots', `${percentage(busyRoomSlots, totalRoomSlots)}%`, `${busyRoomSlots} / ${totalRoomSlots} room slots overlap a class`],
      ['Peak slot occupancy', `${peak}%`, 'Busiest slot in this filtered week'],
      ['Scheduled sessions', scheduledSessions().filter(s => visibleDays.some(day=>day.toUpperCase()===s.day)&&rooms.some(r => r.code === s.classroom)).length, 'Lecture and lab meetings on the displayed days']]) +
    unscheduledNotice() +
    `<section class="panel"><div class="section-heading"><div><h2>Weekly occupancy heatmap</h2><small>Occupied rooms ÷ matching rooms · select a teaching block to inspect it</small></div><div class="actions"><button id="occupancy-weekends" type="button" aria-pressed="${roomView.weekends}">${roomView.weekends?'Hide weekends':'Show weekends'}</button><button id="print-occupancy">Print view</button></div></div>
      <div class="heat-legend"><span>Less occupied</span><i class="heat-0"></i><i class="heat-1"></i><i class="heat-2"></i><i class="heat-3"></i><i class="heat-4"></i><span>More occupied</span><span>Each cell also lists free rooms.</span></div>
      ${rooms.length && slots.length ? `<div class="occupancy-scroll"><table class="heatmap"><caption class="sr-only">Room occupancy by day and teaching block</caption><thead><tr><th scope="col">Time</th>${visibleDays.map(day => `<th scope="col">${day}</th>`).join('')}</tr></thead><tbody>
      ${slots.map(({start,end,days:configuredDays}) => `<tr><th scope="row">${start}<small>${end}</small></th>${visibleDays.map(label => {
        const day = label.toUpperCase();
        if(!configuredDays.has(day))return '<td aria-label="No teaching block">—</td>';
        const cell = slotOccupancy(rooms, day, start, end);
        const level = cell.occupied ? Math.max(1, Math.ceil(cell.percent / 25)) : 0;
        const selected = roomView.selectedSlot?.day === day && roomView.selectedSlot?.start === start && roomView.selectedSlot?.end === end;
        return `<td><button class="heat-cell heat-${level} ${selected ? 'is-selected' : ''}" data-inspect-day="${day}" data-inspect-start="${start}" data-inspect-end="${end}" aria-pressed="${selected}" aria-label="${day} ${start}–${end}, ${cell.occupied} of ${rooms.length} rooms occupied, ${cell.free} free"><strong>${cell.percent}%</strong><span>${cell.occupied} / ${rooms.length} occupied</span><small>${cell.free} free${cell.blocked ? ` · ${cell.blocked} unavailable` : ''}</small></button></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>` : `<div class="empty">${rooms.length?'No teaching blocks are configured for these days.':'No rooms match these filters. Clear a filter to see the heatmap.'}</div>`}
    </section><section id="slot-inspector" aria-live="polite">${roomView.selectedSlot ? slotInspector() : '<div class="slot-hint">Select a time slot above to compare occupied and free rooms.</div>'}</section>` +
    `<section class="panel"><div class="section-heading"><h2>Open a room timetable</h2><small>${rooms.length} rooms</small></div><div class="room-shortcuts">${rooms.map(room => `<a href="${esc(roomHref(room.code))}"><strong>${esc(room.code)}</strong><span>${esc(room.name)}</span><small>${esc(roomTitle(room.type))} · ${room.capacity} seats</small><span class="text-link">View timetable →</span></a>`).join('') || '<p>No matching rooms.</p>'}</div></section>`;
  bindScopeFilters();
  document.querySelector('#occupancy-weekends').onclick = () => {
    roomView.weekends = !roomView.weekends;
    if(!roomView.weekends && ['SATURDAY','SUNDAY'].includes(roomView.selectedSlot?.day))roomView.selectedSlot=null;
    render();
    document.querySelector('#occupancy-weekends').focus({preventScroll:true});
  };
  document.querySelector('#print-occupancy').onclick = () => window.print();
}

function statusLabel(state) {
  if (state.collision) return ['conflict', 'Room conflict'];
  if (state.occupied && state.blocked) return ['conflict', 'Occupied + unavailable'];
  if (state.occupied) return ['occupied', 'Occupied'];
  if (state.blocked) return ['blocked', 'Unavailable'];
  return ['free', 'Free'];
}

function slotInspector() {
  const slot = roomView.selectedSlot;
  if (!slot) return '';
  const summary = slotOccupancy(roomsInScope(), slot.day, slot.start, slot.end);
  return `<section class="panel"><div class="section-heading"><div><h2 tabindex="-1" id="slot-heading">${esc(slot.day)} · ${slot.start}–${slot.end}</h2><small>${summary.free} free · ${summary.occupied} occupied · ${summary.blocked} unavailable</small></div><button id="show-slot-rooms">Find rooms for this time →</button></div><div class="panel-content"><div class="slot-room-list">${summary.states.map(state => {
    const [style, label] = statusLabel(state);
    return `<a class="slot-room ${style}" href="${esc(roomHref(state.room.code))}"><div><strong>${esc(state.room.code)}</strong><small>${esc(state.room.name)} · ${state.room.capacity} seats</small></div><span class="room-status ${style}">${label}</span><small>${state.sessions.map(s => esc(s.name)).join(', ') || (state.blocked ? 'Room availability restriction' : 'Free for the complete interval')}</small></a>`;
  }).join('') || '<p>No rooms in this scope.</p>'}</div></div></section>`;
}

function bindScopeFilters() {
  document.querySelector('#room-campus').onchange = event => { roomView.campus = event.target.value; roomView.building = ''; render(); };
  document.querySelector('#room-building').onchange = event => { roomView.building = event.target.value; render(); };
  document.querySelector('#room-min-seats').onchange = event => { roomView.minSeats = Math.max(0, Number(event.target.value) || 0); render(); };
  document.querySelectorAll('[data-room-type]').forEach(input => { input.onchange = () => {
    roomView.types = [...document.querySelectorAll('[data-room-type]:checked')].map(el => el.dataset.roomType); render();
  }; });
  document.querySelector('#reset-room-filters').onclick = () => {
    Object.assign(roomView, {types: [], campus: '', building: '', minSeats: 0, status: '', query: ''}); render();
  };
}

function classroomFinder() {
  const valid = (!roomView.day||dayCodes().includes(roomView.day)) && windowValid(roomView.start, roomView.end);
  const scope = roomsInScope();
  const states = valid ? scope.map(room => ({room, ...roomWindow(room, roomView.day, roomView.start, roomView.end)})) : [];
  const visible = states.filter(state => !roomView.status || (roomView.status === 'free' ? state.free : roomView.status === 'occupied' ? state.occupied : state.blocked));
  const matchesSearch = state => foldSearch(`${state.room.code} ${state.room.name} ${roomTitle(state.room.type)} ${state.room.building}`).includes(foldSearch(roomView.query));
  const shownCount = visible.filter(matchesSearch).length;
  main.innerHTML = heading('Classrooms', 'Choose a day and time to see which rooms are occupied, free, or unavailable.') +
    `<div class="view-switch"><a class="selected" href="#classrooms">Find a classroom</a><a href="#occupancy">Weekly occupancy</a><button class="primary" data-action="add" data-key="classrooms">+ Add classroom</button></div>` +
    `<section class="panel time-picker"><div class="panel-content"><div class="section-kicker">CHECK A TIME WINDOW</div><div class="filter-bar">
      ${selectControl('finder-day', 'Day', days.map((day, i) => [dayCodes()[i], day]), roomView.day, 'All days')}
      <label>From<input id="finder-start" type="time" value="${esc(roomView.start)}" required></label>
      <label>Until<input id="finder-end" type="time" value="${esc(roomView.end)}" required></label>
      ${selectControl('finder-status', 'Room status', [['free','Free rooms'],['occupied','Occupied rooms'],['blocked','Unavailable rooms']], roomView.status, 'All statuses')}
      <button id="show-finder-heatmap">Show this slot in heatmap</button>
    </div><small>Free means no class or availability restriction overlaps any part of this interval. Unassigned sessions are excluded.</small></div></section>` +
    scopeFilters() +
    (valid ? statCards([['Matching rooms', scope.length, `${roomView.start}–${roomView.end} · ${roomView.day||'All days'}`],['Free rooms',states.filter(s => s.free).length,'Available for the entire selected interval'],['Occupied rooms',states.filter(s => s.occupied).length,'At least one scheduled class overlaps'],['Unavailable rooms',states.filter(s => s.blocked && !s.occupied).length,'Restricted by room availability']]) : '<div class="notice" role="alert">Choose a day and an end time later than the start time.</div>') +
    unscheduledNotice() +
    `<section class="panel"><div class="section-heading"><h2>Room availability</h2><span id="finder-count">${shownCount} rooms shown</span></div><div class="panel-content"><label class="room-search">Search rooms<input id="finder-search" type="search" value="${esc(roomView.query)}" placeholder="Code, name, building, or type"></label>
    <div class="table-wrap"><table class="room-results"><thead><tr><th scope="col">Classroom</th><th scope="col">Type / location</th><th scope="col">Status</th><th scope="col">Seat fill</th><th scope="col">Scheduled classes</th><th scope="col">Actions</th></tr></thead><tbody>${visible.map(state => {
      const room = state.room, index = data.classrooms.indexOf(room), [style, label] = statusLabel(state);
      return `<tr class="room-result ${style}" ${matchesSearch(state) ? '' : 'hidden'}><td><a class="room-name" href="${esc(roomHref(room.code))}"><strong>${esc(room.code)} ↗</strong><span>${esc(room.name)}</span></a></td><td><span>${esc(roomTitle(room.type))}</span><small>${esc(room.building)}</small></td><td><span class="room-status ${style}">${label}</span></td><td><strong>${state.occupied ? state.seatFill + '%' : '—'}</strong><small>${state.peakDemand} / ${room.capacity} seats${state.peakDemand > room.capacity ? ' · Over capacity' : ''}</small></td><td>${state.sessions.map(s => `<a class="class-link" href="#courses/edit/${s.courseIndex}">${esc(s.name)}<small>${esc(s.day)} · ${esc(s.start)}–${esc(s.end)}</small></a>`).join('') || `<span class="muted">${state.blocked ? 'Availability restriction' : 'No class in this interval'}</span>`}</td><td><div class="actions"><a class="tag" href="${esc(roomHref(room.code))}">Timetable</a><a class="tag" href="#classrooms/edit/${index}">Details</a><button data-action="edit" data-key="classrooms" data-index="${index}">Edit</button><button class="danger" data-action="delete" data-key="classrooms" data-index="${index}">Delete</button></div></td></tr>`;
    }).join('')}</tbody></table></div><p id="finder-empty" class="empty" ${shownCount ? 'hidden' : ''}>${valid ? 'No rooms match these filters. Try a different type, capacity, or time.' : 'Select a valid time window to check rooms.'}</p></div></section>`;
  bindScopeFilters();
  for (const [id, prop] of [['finder-day','day'],['finder-start','start'],['finder-end','end'],['finder-status','status']]) {
    document.getElementById(id).onchange = event => { roomView[prop] = event.target.value; render(); };
  }
  document.querySelector('#finder-search').oninput = event => {
    roomView.query = event.target.value;
    let count = 0;
    document.querySelectorAll('.room-result').forEach(row => {
      row.hidden = !foldSearch(row.textContent).includes(foldSearch(roomView.query)); if (!row.hidden) count++;
    });
    document.querySelector('#finder-count').textContent = `${count} rooms shown`;
    document.querySelector('#finder-empty').hidden = count > 0;
  };
  document.querySelector('#show-finder-heatmap').onclick = () => {
    if (!valid || !dayCodes().includes(roomView.day)) { notify('Choose a valid day and time first.'); return; }
    if(['SATURDAY','SUNDAY'].includes(roomView.day))roomView.weekends=true;
    roomView.selectedSlot = {day: roomView.day, start: roomView.start, end: roomView.end}; location.hash = 'occupancy';
  };
}

function layoutEvents(sessions) {
  // Overlapping sessions receive separate columns so conflicts remain visible.
  const sorted = [...sessions].sort((a,b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const result = [];
  let group = [], groupEnd = -1;
  function flush() {
    const lanes = [];
    const placed = group.map(session => {
      let lane = lanes.findIndex(end => end <= minutes(session.start));
      if (lane < 0) lane = lanes.length;
      lanes[lane] = minutes(session.end);
      return {session, lane};
    });
    placed.forEach(item => result.push({...item, columns: lanes.length})); group = [];
  }
  for (const session of sorted) {
    if (minutes(session.start) >= groupEnd && group.length) flush();
    if (!group.length) groupEnd = -1;
    group.push(session); groupEnd = Math.max(groupEnd, minutes(session.end));
  }
  if (group.length) flush();
  return result;
}

function roomTimetable(code) {
  const room = data.classrooms.find(r => r.code === code);
  if (!room) { main.innerHTML = heading('Classroom not found', 'The room may have been renamed or removed.') + '<a class="button primary" href="#classrooms">Return to classrooms</a>'; return; }
  const sessions = scheduledSessions().filter(s => s.classroom === code), bounds = timeBounds(sessions);
  const hours = (bounds.end - bounds.start) / 60, rowHeight = 76;
  const bookedMinutes = dayCodes().reduce((sum, day) => {
    const intervals = sessions.filter(s => s.day === day).map(s => [minutes(s.start), minutes(s.end)]).sort((a,b) => a[0]-b[0]);
    let total = 0, end = -1;
    intervals.forEach(([start, stop]) => { total += Math.max(0, stop - Math.max(start,end)); end = Math.max(end,stop); });
    return sum + total;
  }, 0);
  const demandMinutes = sessions.reduce((sum,s) => sum + s.demand * (minutes(s.end) - minutes(s.start)), 0);
  const sessionMinutes = sessions.reduce((sum,s) => sum + minutes(s.end) - minutes(s.start), 0);
  main.innerHTML = `<a class="back" href="#occupancy">← All room occupancy</a>` + heading(`${room.code} · ${room.name}`, `${roomTitle(room.type)} · ${room.building} · ${room.campus}`) +
    `<div class="view-switch"><a href="#occupancy">Campus heatmap</a><a class="selected" href="${esc(roomHref(code))}">Classroom timetable</a><a href="#classrooms/edit/${data.classrooms.indexOf(room)}">Room details & availability</a><button id="print-room">Print timetable</button></div>` +
    `<section class="panel"><div class="panel-content">${selectControl('room-switcher','Classroom',data.classrooms.map(r => [r.code, `${r.code} · ${r.name}`]),code,'Choose a classroom')}</div></section>` +
    statCards([['Room capacity',room.capacity,'Seats available in this classroom'],['Scheduled sessions',sessions.length,'Sessions with assigned day and time'],['Time utilization',percentage(bookedMinutes, (bounds.end-bounds.start)*days.length)+'%',`${(bookedMinutes/60).toFixed(1)} booked hours across the displayed week`],['Seat fill during classes',sessionMinutes ? Math.round(demandMinutes/(sessionMinutes*room.capacity)*100)+'%' : '—','Demand weighted by each session’s duration']]) +
    `<section class="panel"><div class="section-heading"><div><h2>Weekly classroom timetable</h2><small>Class blocks follow their actual start and end times. Open a class to edit it.</small></div><div class="schedule-legend"><span>▣ Lecture</span><span>▤ Lab</span><span>▧ Unavailable</span></div></div>
    <div class="room-calendar-scroll"><div class="room-calendar" style="--hours:${hours};--hour-height:${rowHeight}px"><div class="calendar-corner">Time</div>${days.map(d=>`<div class="room-day-heading">${d}</div>`).join('')}
    <div class="room-time-axis" style="height:${hours*rowHeight}px">${Array.from({length:hours},(_,i)=>`<span style="top:${i*rowHeight}px">${clock(bounds.start+i*60)}</span>`).join('')}</div>
    ${dayCodes().map((day,dayIndex)=>`<div class="room-day-track" style="height:${hours*rowHeight}px" aria-label="${days[dayIndex]} timetable">${Array.from({length:hours},(_,i)=>{
      const hour=Math.floor(bounds.start/60)+i;
      return room.availability?.[`${dayIndex}-${hour}`]==='Unavailable'?`<div class="unavailable-block" style="top:${i*rowHeight}px;height:${rowHeight}px"><span>Unavailable</span></div>`:'';
    }).join('')}${layoutEvents(sessions.filter(s=>s.day===day)).map(({session:s,lane,columns})=>{
      const height=(minutes(s.end)-minutes(s.start))/60*rowHeight,top=(minutes(s.start)-bounds.start)/60*rowHeight;
      return `<a class="room-event ${s.kind==='Lab'?'lab-event':''} ${columns>1?'overlap-event':''} ${height<65?'short-event':''}" href="#courses/edit/${s.courseIndex}" style="top:${top}px;height:${height}px;left:calc(${lane/columns*100}% + 3px);width:calc(${100/columns}% - 6px)" title="${esc(s.name+' · '+s.start+'–'+s.end+' · '+s.instructor+' · '+s.demand+'/'+room.capacity+' seats')}"><span class="event-time">${s.start}–${s.end} · ${esc(sessionType(s))}</span><strong>${esc(s.name)}</strong><span class="event-course">${esc(data.courses[s.courseIndex].name)}</span><small>${esc(s.instructor)}</small><small>${s.demand} / ${room.capacity} seats${s.demand>room.capacity?' · OVER CAPACITY':''}${columns>1?' · OVERLAP':''}</small></a>`;
    }).join('')}</div>`).join('')}</div></div></section>` +
    panel('Class details',`<div class="table-wrap"><table><thead><tr><th>Class</th><th>Day & time</th><th>Instructor</th><th>Demand / capacity</th><th>Seat fill</th></tr></thead><tbody>${sessions.map(s=>`<tr><td><a class="text-link" href="#courses/edit/${s.courseIndex}">${esc(s.name)}</a></td><td>${esc(s.day)} · ${s.start}–${s.end}</td><td>${esc(s.instructor)}</td><td>${s.demand} / ${room.capacity}</td><td>${percentage(s.demand,room.capacity)}%</td></tr>`).join('')}</tbody></table></div>${sessions.length?'':'<p>No scheduled classes in this room.</p>'}`,true) +
    `<div class="notice">Room occupancy is time used; seat fill is student demand ÷ capacity. Neither measures live attendance. <a href="#planning">Compare alternative classrooms →</a></div>`;
  document.querySelector('#room-switcher').onchange = event => { location.hash = event.target.value ? roomHref(event.target.value) : '#occupancy'; };
  document.querySelector('#print-room').onclick = () => window.print();
}

// Single-session classroom evaluator used in the Session Room Explorer tab.
function roomCandidates(session, requiredType, spaceWeight) {
  if (!isScheduled(session)) return [];
  const instructor = data.instructors.find(i=>i.name+' '+i.surname===session.instructor);
  const instructorConflicts = scheduledSessions().filter(s=>sessionKey(s)!==sessionKey(session)&&s.instructor===session.instructor&&s.day===session.day&&overlaps(minutes(s.start),minutes(s.end),minutes(session.start),minutes(session.end)));
  const instructorBlocked=unavailableHours(instructor,dayCodes().indexOf(session.day),session.start,session.end).length>0;
  return data.classrooms.map(room=>{
    const state=roomWindow(room,session.day,session.start,session.end,sessionKey(session)), reasons=[];
    if(room.capacity<session.demand)reasons.push(`Needs ${session.demand-room.capacity} more seats`);
    if(requiredType&&room.type!==requiredType)reasons.push('Different room type');
    if(state.occupied)reasons.push('Another class overlaps');
    if(state.blocked)reasons.push('Room unavailable');
    if(instructorConflicts.length)reasons.push('Instructor has another class');
    if(instructorBlocked)reasons.push('Instructor unavailable');
    if(!instructor)reasons.push('Instructor missing');
    const tooClose=scheduledSessions().some(s=>s.classroom===room.code&&s.day===session.day&&sessionKey(s)!==sessionKey(session)&&!overlaps(minutes(s.start),minutes(s.end),minutes(session.start),minutes(session.end))&&
      Math.min(Math.abs(minutes(s.start)-minutes(session.end)),Math.abs(minutes(session.start)-minutes(s.end)))<room.gap);
    if(tooClose)reasons.push(`Less than ${room.gap} min room turnaround`);
    const travelConflict=scheduledSessions().some(s=>{
      if(s.instructor!==session.instructor||s.day!==session.day||sessionKey(s)===sessionKey(session)||overlaps(minutes(s.start),minutes(s.end),minutes(session.start),minutes(session.end)))return false;
      const otherRoom=data.classrooms.find(r=>r.code===s.classroom);
      const reqTravel=typeof minTravelMinutes==='function'?minTravelMinutes(room,otherRoom):0;
      const gap=Math.min(Math.abs(minutes(s.start)-minutes(session.end)),Math.abs(minutes(session.start)-minutes(s.end)));
      return reqTravel>0&&gap<reqTravel;
    });
    if(travelConflict)reasons.push('Insufficient inter-building travel time');
    const department=data.courses[session.courseIndex].department;
    const buildingPreference=data.buildingScores.find(score=>score.department===department&&score.building===room.building)?.score||0;
    const seatScore=room.capacity>=session.demand?100*(1-(room.capacity-session.demand)/Math.max(room.capacity,1)):0;
    const score=Math.round(seatScore*(spaceWeight/100)+Math.min(100,buildingPreference)*(1-spaceWeight/100));
    return {room,reasons,score,seatScore:Math.round(seatScore),buildingPreference};
  }).sort((a,b)=>Number(a.reasons.length>0)-Number(b.reasons.length>0)||b.score-a.score||a.room.code.localeCompare(b.room.code));
}

function planningPage() {
  const sessions=allSessions();
  let session=sessions.find(s=>sessionKey(s)===planningView.session)||sessions.find(isScheduled);
  if(session)planningView.session=sessionKey(session);
  const candidates=session?roomCandidates(session,planningView.requiredType,planningView.spaceWeight):[];
  main.innerHTML=heading('Planning lab','Compare room choices and explain the checks behind an assignment.')+
    `<div class="notice">Compare rooms for a selected session. Suitable rooms are ranked by seat fit and department building preference.</div>`+
    `<section class="panel"><div class="section-heading"><h2>Choose a teaching session</h2></div><div class="panel-content"><div class="form-grid">
      ${selectControl('planning-session','Teaching session',sessions.map(s=>[sessionKey(s),`${s.name} · ${s.day||'No day'} ${s.start||''}`]),planningView.session,'Choose a session')}
      ${selectControl('planning-type','Required classroom type',data.classroomTypes.map(t=>[t.name,roomTitle(t.name)]),planningView.requiredType,'Any classroom type')}
    </div><div class="weight-control"><label for="planning-weight">Preference balance</label><input id="planning-weight" type="range" min="0" max="100" value="${planningView.spaceWeight}"><div class="weight-numbers"><label>Seat fit (%)<input id="planning-seat-weight" type="number" min="0" max="100" step="1" value="${planningView.spaceWeight}"></label><label>Building preference (%)<input id="planning-building-weight" type="number" min="0" max="100" step="1" value="${100-planningView.spaceWeight}"></label></div><span>${planningView.spaceWeight}% seat fit · ${100-planningView.spaceWeight}% building preference</span></div>
    <small>Room capacity, type, overlapping classes, room/instructor availability, and room turnaround are feasibility checks. The slider ranks the remaining choices.</small></div></section>`+
    (session?statCards([['Selected session',session.name,`${session.day||'No day'} · ${session.start||'—'}–${session.end||'—'}`],['Student demand',session.demand,'Required seats'],['Current classroom',session.classroom,'Assignment stays unchanged until you apply a room'],['Suitable rooms',candidates.filter(c=>!c.reasons.length).length,'Pass the checks listed above']]):'')+
    `<section class="panel"><div class="section-heading"><h2>Room comparison</h2></div><div class="panel-content">${session&&isScheduled(session)?`<div class="table-wrap"><table><thead><tr><th>Classroom</th><th>Capacity / seat fit</th><th>Building preference</th><th>Score</th><th>Feasibility</th><th>Action</th></tr></thead><tbody>${candidates.map(candidate=>`<tr><td><a class="text-link" href="${esc(roomHref(candidate.room.code))}">${esc(candidate.room.code)}</a><small>${esc(roomTitle(candidate.room.type))}</small></td><td>${candidate.room.capacity} seats<small>${candidate.seatScore}% seat fit</small></td><td>${candidate.buildingPreference} / 100<small>${esc(candidate.room.building)}</small></td><td><strong>${candidate.score}</strong> / 100</td><td>${candidate.reasons.length?candidate.reasons.map(reason=>`<span class="reason">${esc(reason)}</span>`).join(''):'<span class="room-status free">Passes these checks</span>'}</td><td><button class="${!candidate.reasons.length?'primary':''}" data-apply-room="${esc(candidate.room.code)}" ${candidate.reasons.length||candidate.room.code===session.classroom?'disabled':''}>${candidate.room.code===session.classroom?'Current room':'Apply room'}</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">Select a session with an assigned day and time. Add or edit a course to create one.</p>'}</div></section>`;
  document.querySelector('#planning-session').onchange=e=>{planningView.session=e.target.value;render();};
  document.querySelector('#planning-type').onchange=e=>{planningView.requiredType=e.target.value;render();};
  document.querySelector('#planning-weight').onchange=e=>{planningView.spaceWeight=Number(e.target.value);render();};
  for(const [id,inverse]of [['planning-seat-weight',false],['planning-building-weight',true]])document.getElementById(id).onchange=e=>{
    const value=e.target.valueAsNumber;
    if(!Number.isInteger(value)||value<0||value>100){notify('Enter a whole percentage between 0 and 100.');e.target.value=inverse?100-planningView.spaceWeight:planningView.spaceWeight;return;}
    planningView.spaceWeight=inverse?100-value:value;render();
  };
}

function loadPresentationExample() {
  if(!confirm('Load synthetic presentation data and replace the current workspace? Export first if you want a backup. Undo can restore this workspace.'))return;
  checkpoint();data=clone(window.EXAMPLE_DATA);
  const labs=[['WEDNESDAY','13:30','15:20'],['THURSDAY','13:30','15:20'],['FRIDAY','13:30','15:20'],['THURSDAY','09:30','11:20'],['WEDNESDAY','09:30','11:20']];
  let labIndex=0;data.courses.forEach(course=>course.labs.forEach(lab=>{const [day,start,end]=labs[labIndex++%labs.length];Object.assign(lab,{day,start,end});}));
  // Extra, clearly synthetic courses make density and room-fit differences easy to demonstrate.
  const examples=[
    ['CS301','Database Systems','CS','TH-201','Grace Hopper','MONDAY','09:30','11:20',55],
    ['EE201','Signals and Systems','EE','TL-205','Claude Shannon','MONDAY','09:30','11:20',48],
    ['MATH201','Linear Algebra','MATH','NC-101','Ada Lovelace','MONDAY','09:30','11:20',115],
    ['PHYS201','Electromagnetism','PHYS','NC-202','Richard Feynman','MONDAY','09:30','11:20',60],
    ['CS302','Operating Systems','CS','TH-101','Donald Knuth','TUESDAY','09:30','11:20',75],
    ['EE202','Digital Design','EE','TL-LAB1','Nikola Tesla','TUESDAY','13:30','15:20',30],
    ['MATH202','Probability','MATH','AH-101','Carl Gauss','WEDNESDAY','13:30','15:20',50]
  ];
  examples.forEach(([code,name,department,classroom,instructor,day,start,end,demand])=>data.courses.push({code,name,department,patterns:'2+0',sections:[{name:code+'.01',classroom,instructor,day,start,end,demand}],labs:[],distributions:[{term:3,department,percentage:100}]}));
  // A capacity exception and a blocked room make both explanations visible.
  data.courses.find(c=>c.code==='CS301').sections[0].demand=68;
  data.classrooms.find(r=>r.code==='TH-LAB1').availability={'0-9':'Unavailable','0-10':'Unavailable'};
  Object.assign(roomView,{types:[],campus:'',building:'',minSeats:0,day:'MONDAY',start:'09:30',end:'10:30',status:'',query:'',selectedSlot:null});
  planningView.session='5:Section:0';planningView.requiredType='';
  persist();location.hash='occupancy';render();notify('Synthetic presentation example loaded. Undo restores your previous workspace.');
}

document.addEventListener('click',event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();main.focus();return;}
  const cell=event.target.closest('[data-inspect-day]');
  if(cell){
    roomView.selectedSlot={day:cell.dataset.inspectDay,start:cell.dataset.inspectStart,end:cell.dataset.inspectEnd};
    document.querySelectorAll('.heat-cell').forEach(button=>{button.classList.toggle('is-selected',button===cell);button.setAttribute('aria-pressed',String(button===cell));});
    document.querySelector('#slot-inspector').innerHTML=slotInspector();
    document.querySelector('#slot-heading')?.focus();
  }
  if(event.target.closest('#show-slot-rooms')){
    Object.assign(roomView,{day:roomView.selectedSlot.day,start:roomView.selectedSlot.start,end:roomView.selectedSlot.end});
    location.hash='classrooms';
  }
  const apply=event.target.closest('[data-apply-room]');
  if(apply&&!apply.disabled){
    const session=allSessions().find(s=>sessionKey(s)===planningView.session);
    const candidate=session&&roomCandidates(session,planningView.requiredType,planningView.spaceWeight).find(c=>c.room.code===apply.dataset.applyRoom);
    if(!candidate||candidate.reasons.length){notify('This room no longer passes the checks. Refresh the comparison.');return;}
    checkpoint();
    sessionRecord(data,session).classroom=candidate.room.code;
    persist();render();notify(`${session.name} assigned to ${candidate.room.code}. Undo is available.`);
  }
});

const renderBeforeOccupancy=render;
render=function(){
  renderBeforeOccupancy();
  const [page,action,code]=(location.hash.slice(1)||'dashboard').split('/');
  if(page==='occupancy'){
    if(action==='room'){let decoded;try{decoded=decodeURIComponent(code||'');}catch(_){decoded='';}roomTimetable(decoded);}
    else occupancyPage();
  }
  if(page==='classrooms'&&!action)classroomFinder();
  if(page==='planning')planningPage();
  if(page==='classrooms'&&action==='edit'&&data.classrooms[Number(code)]){
    const link=document.createElement('a');link.className='button primary room-detail-timetable';link.href=roomHref(data.classrooms[Number(code)].code);link.textContent='Open classroom timetable →';
    document.querySelector('.page-heading')?.after(link);
  }
  if(page==='dashboard'){
    const intro=document.createElement('section');intro.className='occupancy-entry panel';
    intro.innerHTML='<div><span class="section-kicker">CLASSROOM CAPACITY PLANNING</span><h2>Which rooms are free, and when?</h2><p>Explore the weekly occupancy map, find a suitable room, or compare room assignments.</p></div><div><a class="button primary" href="#occupancy">Open room occupancy →</a><a class="button" href="#planning">Planning lab</a></div>';
    document.querySelector('.welcome')?.after(intro);
  }
  if(page==='help')main.insertAdjacentHTML('afterbegin','<div class="notice"><strong>New: classroom occupancy.</strong> Open Room occupancy for the heatmap; select a cell to inspect rooms. In Classrooms, choose day, start/end time, and room types. Click any room to see its classes on a scaled timetable. Planning lab compares and applies alternative room assignments.</div>');
  document.title='Defterdar · '+(document.querySelector('nav a.active span')?.textContent||'Workspace');
};
render();
