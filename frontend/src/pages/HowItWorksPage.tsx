import { ArrowRight, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { categories, categoryLabels } from '../domain'
import { categoryIcons } from '../components/Grades'
import { useWorkspace } from '../app/workspace'

const records = [
  'Housing maintenance violations and their recorded statuses.',
  'Complaints and violations related to heat or hot water.',
  'Rodent inspection findings and pest-related complaints.',
  'Owner-filed bedbug reports for the filing period.',
  'Noise complaints recorded near the building.',
]

export default function HowItWorksPage() {
  const { housing } = useWorkspace()
  return <div className="container page narrow-page info-page">
    <div className="page-heading"><p className="eyebrow"><ClipboardList size={15} /> Sources and methodology</p><h1>How it works</h1>
      <p>Use a building report to see what’s been recorded and where you may need to ask for more information.</p></div>
    <section className="panel">
      <h2>What we look at</h2>
      <ul className="info-categories">{categories.map((category, index) => {
        const Icon = categoryIcons[category]
        return <li key={category}><Icon size={20} /><div><h3>{categoryLabels[category]}</h3><p>{records[index]}</p></div></li>
      })}</ul>
    </section>
    <section className="panel"><h2>How to read the grades</h2>
      <p>The scoring provider supplies category grades when it has enough comparable evidence. A higher grade indicates fewer recorded problems relative to comparable buildings. An unavailable grade means the provider could not make that evaluation.</p>
      <p>Comparison weights let you emphasize the categories that matter to you. A weighted comparison uses categories with comparable scores across the selected buildings.</p>
      {housing.mode === 'mock' && <p>Demonstration grades and weighted scores use fictional records.</p>}
    </section>
    <section className="panel"><h2>Where public records have gaps</h2>
      <ul className="info-limits"><li>Records can be delayed, incomplete, or matched to an entire tax lot.</li>
        <li>Complaint volume reflects reporting activity. Complaints may be unverified.</li>
        <li>Check source coverage and observation periods before comparing grades.</li>
        <li>Bring unresolved questions to your landlord or building manager.</li></ul>
    </section>
    <Link className="button primary" to={housing.mode === 'mock' ? '/building/example-street' : '/search'}>
      {housing.mode === 'mock' ? 'Explore the sample report' : 'Find a building'} <ArrowRight size={17} />
    </Link>
  </div>
}
