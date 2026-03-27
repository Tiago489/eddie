import Link from 'next/link';

export default function NewTradingPartnerPage() {
  return (
    <div>
      <h2 className="text-2xl font-semibold">Create Trading Partner</h2>
      <p className="text-muted-foreground mt-2">
        Use the <Link href="/trading-partners" className="text-blue-600 hover:underline">Trading Partners</Link> page to create new partners.
      </p>
    </div>
  );
}
