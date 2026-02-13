"use client"

import { useEffect, useState } from 'react';
import SummaryCards from '../components/SummaryCards';
import WorkerCard from '../components/WorkerCard';
import WorkstationCard from '../components/WorkstationCard';
import TimeRangePicker from '../components/TimeRangePicker';
import API from '../services/api';
import { DEFAULT_START, DEFAULT_END, useFactoryMetrics, useWorkerMetrics, useWorkstationMetrics } from '../hooks/useMetrics';
import { mutate } from 'swr';

const WORKER_IDS = ['W1','W2','W3','W4','W5','W6'];
const STATION_IDS = ['S1','S2','S3','S4','S5','S6'];

async function runInBatches<T>(items: T[], fn: (t: T) => Promise<any>, concurrency = 3) {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map(fn));
  }
}

function buildWorkerUrl(id: string, start: string, end: string, populate = false) {
  return `/api/metrics/cache/worker/${id}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${populate ? '&populate=true' : ''}`;
}
function buildWorkstationUrl(id: string, start: string, end: string, populate = false) {
  return `/api/metrics/cache/workstation/${id}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${populate ? '&populate=true' : ''}`;
}
function buildFactoryUrl(start: string, end: string, populate = false) {
  return `/api/metrics/cache/factory?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${populate ? '&populate=true' : ''}`;
}

export default function DashboardPage() {
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [warming, setWarming] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [lastWarm, setLastWarm] = useState<string | null>(null);

  const factoryHook = useFactoryMetrics(start, end, false);
  const factoryMetrics = factoryHook.data?.metrics ?? null;
  const factoryLoading = factoryHook.isLoading || warming;

  // warm cache once
  useEffect(() => {
    let mounted = true;
    async function warm() {
      setWarming(true);
      try {
        await API.get(buildFactoryUrl(start, end, true));
        await runInBatches(WORKER_IDS, (id) => API.get(buildWorkerUrl(id, start, end, true)), 3);
        await runInBatches(STATION_IDS, (id) => API.get(buildWorkstationUrl(id, start, end, true)), 3);
        if (!mounted) return;
        setLastWarm(new Date().toISOString());
        // mutate SWR keys so UI updates (factory + workers + stations)
        mutate(buildFactoryUrl(start, end));
        for (const id of WORKER_IDS) mutate(buildWorkerUrl(id, start, end));
        for (const id of STATION_IDS) mutate(buildWorkstationUrl(id, start, end));
      } catch (err) {
        console.warn('warm failed', err);
      } finally {
        if (mounted) setWarming(false);
      }
    }
    warm();
    return () => { mounted = false; };
  }, [start, end]);

  async function handleRecompute() {
    setRecomputing(true);
    try {
      await API.post('/api/metrics/recompute', { limit: 200 });
      // small pause then rewarm caches
      await new Promise((r) => setTimeout(r, 600));
      await API.get(buildFactoryUrl(start, end, true));
      await runInBatches(WORKER_IDS, (id) => API.get(buildWorkerUrl(id, start, end, true)), 3);
      await runInBatches(STATION_IDS, (id) => API.get(buildWorkstationUrl(id, start, end, true)), 3);
      mutate(buildFactoryUrl(start, end));
      for (const id of WORKER_IDS) mutate(buildWorkerUrl(id, start, end));
      for (const id of STATION_IDS) mutate(buildWorkstationUrl(id, start, end));
      setLastWarm(new Date().toISOString());
    } catch (err) {
      console.error(err);
      alert('Recompute failed — check backend logs');
    } finally {
      setRecomputing(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold">Factory Dashboard</h2>
          <div className="text-sm text-slate-500">{new Date(start).toLocaleString()} — {new Date(end).toLocaleString()}</div>
        </div>

        <div className="flex items-center gap-3">
          <button className="px-3 py-2 bg-white text-slate-800 rounded shadow" onClick={() => { setStart(DEFAULT_START); setEnd(DEFAULT_END); }}>
            Reset window
          </button>

          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="px-4 py-2 bg-indigo-600 text-white rounded shadow disabled:opacity-60"
          >
            {recomputing ? 'Recomputing...' : 'Run recompute & refresh'}
          </button>
        </div>
      </div>

      <TimeRangePicker start={start} end={end} onChange={(s,e) => { setStart(s); setEnd(e); }} />

      <section>
        <SummaryCards metrics={factoryMetrics} loading={factoryLoading} />
        {lastWarm && <div className="text-xs text-slate-400 mb-4">Cache last warmed: {new Date(lastWarm).toLocaleTimeString()}</div>}
      </section>

      <section className="mb-8">
        <h3 className="text-xl font-semibold mb-4">Workers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {WORKER_IDS.map(id => {
            const wh = useWorkerMetrics(id, start, end, false);
            return <WorkerCard key={id} metrics={wh.data?.metrics ?? null} loading={wh.isLoading || warming} />;
          })}
        </div>
      </section>

      <section>
        <h3 className="text-xl font-semibold mb-4">Workstations</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {STATION_IDS.map(id => {
            const sh = useWorkstationMetrics(id, start, end, false);
            return <WorkstationCard key={id} metrics={sh.data?.metrics ?? null} loading={sh.isLoading || warming} />;
          })}
        </div>
      </section>
    </div>
  );
}