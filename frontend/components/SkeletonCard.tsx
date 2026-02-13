export default function SkeletonCard({ height = 44 }: { height?: number }) {
  return <div className="bg-white rounded-lg shadow animate-pulse" style={{ height: `${height}rem` }} />;
}