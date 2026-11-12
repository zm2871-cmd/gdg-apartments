import Link from 'next/link';
import {notFound} from 'next/navigation';
import {pipeline} from '@/lib/db';
import {getGoogleForBuilding} from '@/lib/google';
import {getIdentity} from '@/lib/reports';

// GMAPS-07. Its own page, not a tab: the report page shows a MapLibre map, and Google content may not be shown
// with or near a non-Google map (Google Maps ToS §3.2.3(e)). Rendered per request and never cached (§3.2.3(b)).
export const dynamic='force-dynamic';
export const fetchCache='force-no-store';
export const metadata={title:'Google reviews',robots:{index:false}}; // don't let search engines store a copy

export default async function GoogleReviews({params}:{params:Promise<{id:string}>}){
  const id=(await params).id;
  if(!/^(nyc-[a-f0-9]{24}|demo-[123])$/.test(id))notFound();
  const identity=await getIdentity(id);
  if(!identity)notFound();
  const db=pipeline();
  const result=identity.demo||!identity.bbl?'no_listing':db?await getGoogleForBuilding(db,identity.bbl):null;

  return <div className="page">
    <div className="breadcrumb"><Link href="/">Home</Link> / <Link href={`/building/${id}`}>Building report</Link> / Google reviews</div>
    <div className="page-heading"><div className="eyebrow">GOOGLE REVIEWS</div><h1>{identity.address}</h1>
      <p>Shown as Google provides them, separate from this building&apos;s grades. They aren&apos;t used in any score.</p></div>
    {result==='no_listing'&&<div className="empty"><h3>No Google listing</h3><p>Google has no apartment listing for this building. Most NYC buildings don&apos;t.</p></div>}
    {result===null&&<div className="banner">Google reviews are unavailable right now. Try again later.</div>}
    {result&&result!=='no_listing'&&<section className="panel">
      <div className="stats">
        <div>Google rating<strong>{result.rating==null?'—':`${result.rating.toFixed(1)} / 5`}</strong></div>
        <div>Ratings<strong>{result.ratingCount}</strong></div>
      </div>
      {result.url&&<p><a className="text-link" href={result.url} target="_blank" rel="noreferrer">View this place on Google Maps ↗</a></p>}
      <p className="chart-note">Up to 5 reviews, sorted by relevance by Google, without filtering. Google doesn&apos;t verify reviews, but checks for and removes fake content when it&apos;s identified. <a className="text-link" href="https://support.google.com/contributionpolicy/answer/7400114" target="_blank" rel="noreferrer">Google&apos;s review policy ↗</a></p>
      {!result.reviews.length&&<p>No reviews yet.</p>}
      {result.reviews.map(r=><article className="record" key={r.url}>
        <div className="record-top">
          {/* Plain <img>: next/image would cache Google's avatar on our image optimizer, which §3.2.3(b) bans. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {r.authorPhotoUri&&<img src={r.authorPhotoUri} alt="" width={32} height={32} style={{borderRadius:'50%'}} referrerPolicy="no-referrer"/>}
          {r.authorUri?<a href={r.authorUri} target="_blank" rel="noreferrer">{r.author}</a>:<span>{r.author}</span>}
          <span className="tag" aria-label={`Rated ${r.rating} out of 5`}>{r.rating} / 5</span>
          {r.relativeTime&&<span>{r.relativeTime}</span>}
        </div>
        {r.text&&<p>{r.text}</p>}
        {r.translated&&<details className="details"><summary>Translated by Google · show original</summary><p>{r.originalText}</p></details>}
        <a href={r.url} target="_blank" rel="noreferrer">View on Google Maps ↗</a>
        {r.flagUrl&&<span className="details"> · <a href={r.flagUrl} target="_blank" rel="noreferrer">Report this review</a></span>}
      </article>)}
      <p className="chart-note">Google Maps</p>
    </section>}
  </div>;
}
