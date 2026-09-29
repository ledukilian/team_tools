(function (global) {
  const KEY = 'lead-tools-store-v1';
  const LEGACY_WEATHER_KEY = 'meteo-equipe-store-v3';

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function emptyStore() {
    return {
      teams: [],
      people: [],
      periods: [],
      selectedTeamId: null,
      selectedPeriodId: null,
      weather: { notes: [] },
      skillMatrix: { skills: [], ratings: {}, filter: 'all', pathPerson: null },
      curse: { estimations: [] },
      jira: { host: '', token: '' }
    };
  }

  function isNote(value) {
    return Number.isInteger(value) && value >= 0 && value <= 5;
  }

  function normalizeDay(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  function formatDay(value) {
    const day = normalizeDay(value);
    if (!day) return '—';
    const [y, m, d] = day.split('-');
    return `${d}/${m}/${y}`;
  }

  function todayIso() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }

  function dayToNum(value) {
    const day = normalizeDay(value);
    return day ? Number(day.replace(/-/g, '')) : null;
  }

  function personCoversPeriod(person, period) {
    const windowStart = dayToNum(period && period.startDate) || dayToNum(period && period.endDate) || dayToNum(todayIso());
    const windowEnd = dayToNum(period && period.endDate) || dayToNum(period && period.startDate) || dayToNum(todayIso());
    const start = dayToNum(person.startDate);
    const end = dayToNum(person.endDate);
    if (start && start > windowEnd) return false;
    if (end && end < windowStart) return false;
    return true;
  }

  function parseFlexibleDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return { value: null };
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (m) {
      const day = normalizeDay(`${m[1]}-${m[2]}-${m[3]}`);
      return day ? { value: day } : { error: true };
    }
    m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(raw);
    if (m) {
      const day = normalizeDay(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
      return day ? { value: day } : { error: true };
    }
    return { error: true };
  }

  function isRating(value) {
    return Number.isInteger(value) && value >= 1 && value <= 10;
  }

  function level(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
  }

  function normalizeCurse(data) {
    const raw = data && data.curse && typeof data.curse === 'object' && !Array.isArray(data.curse) ? data.curse : {};
    const list = Array.isArray(raw.estimations) ? raw.estimations : [];
    const seen = new Set();
    const items = [];
    list.forEach(item => {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)) return;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      if (!title) return;
      seen.add(item.id);
      const type = item.type === 'story' ? 'story' : 'feature';
      const scores = item.scores && typeof item.scores === 'object' ? item.scores : {};
      items.push({
        id: item.id,
        title: title.slice(0, 80),
        type,
        parentId: type === 'story' && typeof item.parentId === 'string' ? item.parentId : null,
        scores: { c: level(scores.c), u: level(scores.u), r: level(scores.r), s: level(scores.s), e: level(scores.e) }
      });
    });
    const features = new Set(items.filter(item => item.type === 'feature').map(item => item.id));
    items.forEach(item => {
      if (item.parentId && !features.has(item.parentId)) item.parentId = null;
    });
    return { estimations: items };
  }

  function keptIds(value, allowed) {
    if (!Array.isArray(value)) return null;
    const seen = new Set();
    const ids = [];
    value.forEach(id => {
      if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
    return ids;
  }

  function normalize(data) {
    const teams = Array.isArray(data && data.teams) ? data.teams : [];
    const weekDays = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const validTeams = teams
      .filter(t => t && typeof t.id === 'string' && t.id && typeof t.name === 'string' && t.name.trim())
      .map(t => {
        const rawPresence = t.presence && typeof t.presence === 'object' ? t.presence : {};
        const presence = {};
        weekDays.forEach(day => { presence[day] = rawPresence[day] === 'remote' ? 'remote' : 'office'; });
        return { id: t.id, name: t.name.trim(), presence };
      });
    const teamIds = new Set(validTeams.map(t => t.id));

    const people = Array.isArray(data && data.people) ? data.people : [];
    const validPeople = people
      .filter(p => p && typeof p.id === 'string' && p.id && typeof p.name === 'string' && p.name.trim())
      .map(p => ({
        id: p.id,
        name: p.name.trim(),
        teamId: typeof p.teamId === 'string' && teamIds.has(p.teamId) ? p.teamId : null,
        startDate: normalizeDay(p.startDate),
        endDate: normalizeDay(p.endDate),
        habit: p.habit === 'remote' ? 'remote' : 'office'
      }));
    const personIds = new Set(validPeople.map(p => p.id));

    const rawPeriods = Array.isArray(data && data.periods)
      ? data.periods
      : (data && data.config && Array.isArray(data.config.periods) ? data.config.periods : []);
    const validPeriods = rawPeriods
      .filter(p => p && typeof p.id === 'string' && p.id && typeof p.label === 'string' && p.label.trim())
      .map(p => ({ id: p.id, label: p.label.trim(), startDate: normalizeDay(p.startDate), endDate: normalizeDay(p.endDate) }));
    const periodIds = new Set(validPeriods.map(p => p.id));

    const rawNotes = data && data.weather && Array.isArray(data.weather.notes)
      ? data.weather.notes
      : (Array.isArray(data && data.notes) ? data.notes : []);
    const seenNotes = new Set();
    const validNotes = [];
    rawNotes.forEach(r => {
      if (!r || !periodIds.has(r.periodId) || !personIds.has(r.personId) || !isNote(r.work) || !isNote(r.mood)) return;
      const key = `${r.periodId}:${r.personId}`;
      if (seenNotes.has(key)) return;
      seenNotes.add(key);
      validNotes.push({ periodId: r.periodId, personId: r.personId, work: r.work, mood: r.mood });
    });

    const rawMatrix = data && data.skillMatrix && typeof data.skillMatrix === 'object' ? data.skillMatrix : {};
    const skills = Array.isArray(rawMatrix.skills) ? rawMatrix.skills : [];
    const validSkills = skills
      .filter(s => s && typeof s.id === 'string' && s.id && typeof s.name === 'string' && s.name.trim())
      .map(s => ({ id: s.id, emoji: typeof s.emoji === 'string' && s.emoji.trim() ? s.emoji.trim() : '•', name: s.name.trim() }));
    const skillIds = new Set(validSkills.map(s => s.id));
    const ratings = {};
    const rawRatings = rawMatrix.ratings && typeof rawMatrix.ratings === 'object' ? rawMatrix.ratings : {};
    Object.keys(rawRatings).forEach(periodId => {
      if (!periodIds.has(periodId)) return;
      const byPerson = rawRatings[periodId];
      if (!byPerson || typeof byPerson !== 'object') return;
      const peopleRatings = {};
      Object.keys(byPerson).forEach(personId => {
        if (!personIds.has(personId)) return;
        const bySkill = byPerson[personId];
        if (!bySkill || typeof bySkill !== 'object') return;
        const skillRatings = {};
        Object.keys(bySkill).forEach(skillId => {
          const value = Number(bySkill[skillId]);
          if (!skillIds.has(skillId) || !isRating(value)) return;
          skillRatings[skillId] = value;
        });
        if (Object.keys(skillRatings).length) peopleRatings[personId] = skillRatings;
      });
      if (Object.keys(peopleRatings).length) ratings[periodId] = peopleRatings;
    });

    let selectedPeriodId = typeof data.selectedPeriodId === 'string' ? data.selectedPeriodId : null;
    if (!selectedPeriodId || !periodIds.has(selectedPeriodId)) {
      selectedPeriodId = validPeriods.length ? validPeriods[validPeriods.length - 1].id : null;
    }
    let selectedTeamId = typeof data.selectedTeamId === 'string' ? data.selectedTeamId : null;
    if (!selectedTeamId || !teamIds.has(selectedTeamId)) {
      selectedTeamId = validTeams.length ? validTeams[validTeams.length - 1].id : null;
    }
    const filter = typeof rawMatrix.filter === 'string' ? rawMatrix.filter : 'all';
    const pathPerson = typeof rawMatrix.pathPerson === 'string' ? rawMatrix.pathPerson : null;
    const trackPeople = keptIds(rawMatrix.trackPeople, personIds);
    const trackSkills = keptIds(rawMatrix.trackSkills, skillIds);

    const rawJira = data && data.jira && typeof data.jira === 'object' && !Array.isArray(data.jira) ? data.jira : {};
    const jiraHost = typeof rawJira.host === 'string' ? rawJira.host.trim().replace(/\/+$/, '') : '';
    const jiraToken = typeof rawJira.token === 'string' ? rawJira.token.trim() : '';
    const curse = normalizeCurse(data);

    return {
      teams: validTeams,
      people: validPeople,
      periods: validPeriods,
      selectedTeamId,
      selectedPeriodId,
      weather: { notes: validNotes },
      skillMatrix: { skills: validSkills, ratings, filter, pathPerson, trackPeople, trackSkills },
      curse,
      jira: { host: jiraHost, token: jiraToken }
    };
  }

  function normalizeDaily(data) {
    const rawDaily = data && data.monDaily && typeof data.monDaily === 'object' && !Array.isArray(data.monDaily) ? data.monDaily : (data || {});
    const rawDays = rawDaily.days && typeof rawDaily.days === 'object' && !Array.isArray(rawDaily.days) ? rawDaily.days : {};
    const days = {};
    Object.keys(rawDays).forEach(key => {
      const day = normalizeDay(key);
      const entry = rawDays[key];
      if (!day || !entry || typeof entry !== 'object') return;
      const moodNum = Number(entry.mood);
      const mood = Number.isInteger(moodNum) && moodNum >= 1 && moodNum <= 5 ? moodNum : null;
      const seen = new Set();
      const tasks = [];
      (Array.isArray(entry.tasks) ? entry.tasks : []).forEach(task => {
        if (!task || typeof task.id !== 'string' || !task.id || seen.has(task.id)) return;
        const text = typeof task.text === 'string' ? task.text.trim() : '';
        if (!text) return;
        seen.add(task.id);
        const subtasks = [];
        (Array.isArray(task.subtasks) ? task.subtasks : []).forEach(sub => {
          if (!sub || typeof sub.id !== 'string' || !sub.id || seen.has(sub.id)) return;
          const subText = typeof sub.text === 'string' ? sub.text.trim() : '';
          if (!subText) return;
          seen.add(sub.id);
          subtasks.push({ id: sub.id, text: subText.slice(0, 240), done: !!sub.done });
        });
        tasks.push({ id: task.id, text: text.slice(0, 240), done: !!task.done, subtasks });
      });
      const note = typeof entry.notes === 'string' ? entry.notes.slice(0, 4000) : '';
      const meetingPresets = new Set([15, 30, 45, 60, 120]);
      const seenMeetings = new Set();
      const meetings = [];
      (Array.isArray(entry.meetings) ? entry.meetings : []).forEach(meeting => {
        if (!meeting || typeof meeting.id !== 'string' || !meeting.id || seenMeetings.has(meeting.id)) return;
        const name = typeof meeting.name === 'string' ? meeting.name.trim() : '';
        const minutes = Number(meeting.minutes);
        if (!name || !meetingPresets.has(minutes)) return;
        seenMeetings.add(meeting.id);
        meetings.push({ id: meeting.id, name: name.slice(0, 120), minutes });
      });
      if (mood == null && !tasks.length && !note.trim() && !meetings.length) return;
      days[day] = { mood, tasks, notes: note, meetings };
    });
    const seenSnippets = new Set();
    const snippets = [];
    (Array.isArray(rawDaily.snippets) ? rawDaily.snippets : []).forEach(snippet => {
      if (!snippet || typeof snippet.id !== 'string' || !snippet.id || seenSnippets.has(snippet.id)) return;
      const text = typeof snippet.text === 'string' ? snippet.text.replace(/\s+$/g, '') : '';
      if (!text.trim()) return;
      seenSnippets.add(snippet.id);
      snippets.push({ id: snippet.id, text: text.slice(0, 4000) });
    });
    const postit = typeof rawDaily.postit === 'string' ? rawDaily.postit.slice(0, 2000) : '';
    return { days, snippets, postit };
  }

  function exportDocument(store) {
    return {
      teams: store.teams,
      people: store.people,
      periods: store.periods,
      weather: { notes: store.weather.notes },
      skillMatrix: {
        skills: store.skillMatrix.skills,
        ratings: store.skillMatrix.ratings
      },
      curse: { estimations: store.curse.estimations },
      jira: {
        host: store.jira.host,
        token: store.jira.token
      }
    };
  }

  function parse(text) {
    let data;
    try { data = JSON.parse(String(text).replace(/^\uFEFF/, '')); }
    catch { throw new Error('JSON invalide.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Objet JSON attendu.');
    if (!Array.isArray(data.teams)) throw new Error('teams manquant.');
    if (!Array.isArray(data.people)) throw new Error('people manquant.');
    if (!Array.isArray(data.periods)) throw new Error('periods manquant.');
    if (!data.weather || typeof data.weather !== 'object' || !Array.isArray(data.weather.notes)) throw new Error('weather.notes manquant.');
    if (!data.skillMatrix || typeof data.skillMatrix !== 'object' || Array.isArray(data.skillMatrix)) throw new Error('skillMatrix manquant.');
    if (!Array.isArray(data.skillMatrix.skills)) throw new Error('skillMatrix.skills manquant.');
    if (!data.skillMatrix.ratings || typeof data.skillMatrix.ratings !== 'object' || Array.isArray(data.skillMatrix.ratings)) throw new Error('skillMatrix.ratings manquant.');
    return normalize(data);
  }

  function save(store) {
    localStorage.setItem(KEY, JSON.stringify(store));
  }

  function load() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try { return normalize(JSON.parse(raw)); }
      catch { /* store corrompu */ }
    }
    const legacy = localStorage.getItem(LEGACY_WEATHER_KEY);
    if (legacy) {
      try {
        const store = normalize(JSON.parse(legacy));
        save(store);
        return store;
      } catch { /* legacy illisible */ }
    }
    return emptyStore();
  }

  function removePerson(store, personId) {
    store.people = store.people.filter(p => p.id !== personId);
    store.weather.notes = store.weather.notes.filter(n => n.personId !== personId);
    Object.keys(store.skillMatrix.ratings).forEach(periodId => {
      const byPerson = store.skillMatrix.ratings[periodId];
      if (byPerson) delete byPerson[personId];
    });
    if (store.skillMatrix.pathPerson === personId) store.skillMatrix.pathPerson = null;
    if (store.skillMatrix.filter === personId) store.skillMatrix.filter = 'all';
  }

  function removeTeam(store, teamId) {
    store.teams = store.teams.filter(t => t.id !== teamId);
    store.people.forEach(p => { if (p.teamId === teamId) p.teamId = null; });
    if (store.selectedTeamId === teamId) store.selectedTeamId = store.teams[0] ? store.teams[0].id : null;
  }

  function removePeriod(store, periodId) {
    store.periods = store.periods.filter(p => p.id !== periodId);
    store.weather.notes = store.weather.notes.filter(n => n.periodId !== periodId);
    delete store.skillMatrix.ratings[periodId];
    if (store.selectedPeriodId === periodId) {
      store.selectedPeriodId = store.periods.length ? store.periods[store.periods.length - 1].id : null;
    }
  }

  const DAILY_KEY = 'lead-tools-daily-v1';

  function emptyDaily() {
    return { days: {}, snippets: [], postit: '' };
  }

  function exportDaily(daily) {
    return { days: daily.days, snippets: daily.snippets, postit: daily.postit };
  }

  function parseDaily(text) {
    let data;
    try { data = JSON.parse(String(text).replace(/^\uFEFF/, '')); }
    catch { throw new Error('JSON invalide.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Objet JSON attendu.');
    if (Array.isArray(data.teams)) throw new Error('Ceci est un fichier d\'équipe.');
    const source = data.monDaily && typeof data.monDaily === 'object' ? data.monDaily : data;
    if (!source.days || typeof source.days !== 'object' || Array.isArray(source.days)) throw new Error('days manquant.');
    return normalizeDaily(source);
  }

  function saveDaily(daily) {
    localStorage.setItem(DAILY_KEY, JSON.stringify(daily));
  }

  function loadDaily() {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      try { return normalizeDaily(JSON.parse(raw)); }
      catch { /* store corrompu */ }
    }
    const teamRaw = localStorage.getItem(KEY);
    if (teamRaw) {
      try {
        const team = JSON.parse(teamRaw);
        if (team && team.monDaily && typeof team.monDaily === 'object') {
          const daily = normalizeDaily(team.monDaily);
          saveDaily(daily);
          delete team.monDaily;
          localStorage.setItem(KEY, JSON.stringify(team));
          return daily;
        }
      } catch { /* équipe illisible */ }
    }
    return emptyDaily();
  }

  global.DailyStore = {
    KEY: DAILY_KEY,
    empty: emptyDaily,
    normalize: normalizeDaily,
    exportDocument: exportDaily,
    parse: parseDaily,
    load: loadDaily,
    save: saveDaily
  };

  global.LeadStore = {
    KEY,
    uid,
    emptyStore,
    normalize,
    exportDocument,
    parse,
    load,
    save,
    normalizeDay,
    formatDay,
    personCoversPeriod,
    parseFlexibleDate,
    removePerson,
    removeTeam,
    removePeriod
  };
})(window);
