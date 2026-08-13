// calibration-niche-fields-check.mjs — throwaway diagnostic, not part of
// the pipeline. Pulls real production rss_items likely to be
// Disaster/Environment/Health content (by loose title keyword match, NOT
// the classifier itself) and runs each through the real understandStory()
// to see which get zero subject candidates today. Baseline before any
// content-rules.mjs change.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { understandStory } from './story-understanding.mjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const LOOSE_PATTERNS = [
  /jerebu/i, /haze/i, /gempa/i, /earthquake/i, /ribut/i, /storm/i,
  /kebakaran hutan/i, /wildfire/i, /banjir/i, /flood/i, /tanah runtuh/i,
  /landslide/i, /kemarau/i, /drought/i, /gelombang panas/i, /heatwave/i,
  /extreme heat/i, /taufan/i, /typhoon/i, /cyclone/i, /ribut tropika/i,
  /pencemaran/i, /pollution/i, /kualiti udara/i, /air quality/i,
  /perubahan iklim/i, /climate change/i, /kepupusan/i, /biodiversity/i,
  /penerokaan hutan/i, /deforestation/i, /wabak/i, /outbreak/i,
  /penyakit/i, /disease/i, /virus/i, /demam denggi/i, /dengue/i,
];

const { data: items, error } = await supabase
  .from('rss_items')
  .select('id, title, description, link, source_id, cluster_id')
  .limit(2000);

if (error) { console.error(error); process.exit(1); }

const candidates = items.filter(i => LOOSE_PATTERNS.some(p => p.test(i.title)));
console.log(`Found ${candidates.length} title-keyword matches out of ${items.length} sampled rss_items.\n`);

let zeroCandidate = 0;
for (const item of candidates.slice(0, 60)) {
  const result = understandStory({ title: item.title, description: item.description, link: item.link, sourceName: item.source_id });
  const subjects = [...new Set(result.subject_candidates?.map(h => `${h.value}@${h.confidence}`) ?? [])];
  if (subjects.length === 0) {
    zeroCandidate++;
    console.log(`ZERO — [${item.source_id}] ${item.title}`);
  } else {
    console.log(`OK   — [${item.source_id}] ${item.title} → ${subjects.join(', ')}`);
  }
}
console.log(`\n${zeroCandidate}/${Math.min(candidates.length, 60)} sampled titles get ZERO subject candidate today.`);
