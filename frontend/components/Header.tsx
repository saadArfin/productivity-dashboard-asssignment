// frontend/components/Header.tsx
export default function Header() {
  return (
    <header className="bg-gradient-to-r from-slate-900 to-black text-white">
      <div className="container mx-auto px-4 py-6 flex items-center justify-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Worker Productivity Dashboard</h1>
        </div>
      </div>
    </header>
  );
}