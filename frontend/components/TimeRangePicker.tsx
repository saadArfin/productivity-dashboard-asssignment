import { useState } from 'react';

type Props = {
  start: string;
  end: string;
  onChange: (s: string, e: string) => void;
};

function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  // format yyyy-MM-ddTHH:mm for input value (local)
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export default function TimeRangePicker({ start, end, onChange }: Props) {
  const [sLocal, setSLocal] = useState(isoToLocalInput(start));
  const [eLocal, setELocal] = useState(isoToLocalInput(end));

  return (
    <div className="bg-white rounded-lg p-4 shadow mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
      <div className="flex gap-4 items-center">
        <div>
          <label className="block text-sm text-slate-500">Start</label>
          <input
            type="datetime-local"
            value={sLocal}
            onChange={(e) => { setSLocal(e.target.value); onChange(new Date(e.target.value).toISOString(), end); }}
            className="border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-500">End</label>
          <input
            type="datetime-local"
            value={eLocal}
            onChange={(e) => { setELocal(e.target.value); onChange(start, new Date(e.target.value).toISOString()); }}
            className="border rounded px-3 py-2"
          />
        </div>
      </div>

      <div className="text-sm text-slate-600">
        <div>Selected window:</div>
        <div className="font-medium">{new Date(start).toLocaleString()} — {new Date(end).toLocaleString()}</div>
      </div>
    </div>
  );
}