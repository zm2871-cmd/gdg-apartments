import Link from 'next/link';

export default function Home() {
  return (
    <section className="hero">
      <p className="eyebrow">NYC apartment research, in one place</p>
      <h1>Find a place that feels right.</h1>
      <p>
        Hearthstone Hub is bringing NYC building records together so renters can
        spot problems, compare apartments, and make confident decisions.
      </p>
      <div className="hero-actions">
        <Link className="button" href="/login">Try the sign-in demo</Link>
        <Link className="text-link" href="/account">View my account</Link>
      </div>
      <p className="footnote">Building search and reports are coming next.</p>
    </section>
  );
}
