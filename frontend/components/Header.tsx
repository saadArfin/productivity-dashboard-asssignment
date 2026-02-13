// frontend/components/Header.tsx
export default function Header() {
  return (
    <header className="bg-gradient-to-r from-slate-900 to-black text-white">
      <div className="container mx-auto px-4 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Worker Productivity Dashboard</h1>
          <p className="text-slate-300 text-sm mt-1">AI-powered CCTV → metrics demo</p>
        </div>
        <div className="text-sm text-slate-300">
          <div>Backend: <span className="font-medium text-slate-100">http://localhost:4000</span></div>
        </div>
      </div>
    </header>
  );
}