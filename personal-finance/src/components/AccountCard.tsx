import { formatCurrency } from "@/lib/categories";

interface AccountCardProps {
  name: string;
  institution: string;
  type: string;
  totalValue: number;
  holdingCount: number;
  compact?: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  BANK: "M3 6l9-4 9 4v2H3V6z M3 20h18v2H3v-2z M5 10h2v8H5v-8z M9 10h2v8H9v-8z M13 10h2v8h-2v-8z M17 10h2v8h-2v-8z",
  BROKERAGE: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  CRYPTO_EXCHANGE: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  REAL_ESTATE: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  OTHER: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
};

export default function AccountCard({
  name,
  institution,
  type,
  totalValue,
  holdingCount,
  compact = false,
}: AccountCardProps) {
  const icon = TYPE_ICONS[type] || TYPE_ICONS.OTHER;

  const content = (
    <>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-light flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-sm">{name}</h3>
            <p className="text-xs text-muted">{institution}</p>
          </div>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-accent-light text-accent font-medium">
          {type.replace("_", " ")}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
          <p className="text-xs text-muted mt-1">
            {holdingCount} holding{holdingCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </>
  );

  if (compact) {
    return content;
  }

  return (
    <div className="bg-card border border-card-border rounded-xl p-5 hover:border-accent/30 transition-colors">
      {content}
    </div>
  );
}
