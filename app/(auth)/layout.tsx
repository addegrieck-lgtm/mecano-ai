export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-black text-primary-foreground">M</span>
          <span className="text-lg font-bold tracking-wide">
            MECANO <span className="text-primary">AI</span>
          </span>
        </div>
        <div className="rounded-2xl border bg-card p-6">{children}</div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Le copilote intelligent du garage</p>
      </div>
    </div>
  );
}
