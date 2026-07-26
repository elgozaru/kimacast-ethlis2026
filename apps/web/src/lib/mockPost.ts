import type { Teaser } from "../components/StoryUnlock";

/// DEV_MODE example bundle. This is original social copy WRITTEN for this
/// preview, inspired by the same short, clearly-attributed excerpt used in
/// apps/dashboard-api/data/input-article.md (one reader-submitted
/// speculative scenario about decoding brainwaves, from
/// arbredespossibles.com) - it is not a translation or reproduction of
/// that source text, and it stands in for what a real Claude-generated
/// bundle would look like once ANTHROPIC_API_KEY is configured. Swap this
/// out once the real pipeline is wired up end to end.
export const MOCK_TEASER: Teaser = {
  id: "dev-mock-v187",
  teaser:
    "Scientists can already watch neurons fire in real time. The next leap: turning that raw signal into words and pictures a computer can output.",
  priceTinybars: "2000000",
  sourceUrl: "https://arbredespossibles.com/FutursTechno3.html#V187",
};

export type MockBundle = {
  short_post: string;
  three_post_thread: string[];
  linkedin_summary: string;
  claims_used: string[];
  source_url: string;
};

export const MOCK_BUNDLE: MockBundle = {
  short_post: MOCK_TEASER.teaser,
  three_post_thread: [
    "1/ Brain imaging can already show us neurons firing as we think. The open problem has never been *seeing* the activity - it's turning that electrical noise into words and images a machine can output.",
    "2/ Early decoding work already reconstructs rough shapes and syllables from brain signal alone - no speech, no typing, just neural activity read directly.",
    "3/ The real question isn't whether this eventually works. It's who gets to read the output, and what \"private thought\" even means once it doesn't have to stay private.",
  ],
  linkedin_summary:
    "Brain-computer interfaces are moving from \"observe neural activity\" to \"decode neural activity into words and images.\" Early research already reconstructs rough approximations of thought from brain signals alone. The technical trajectory is fairly clear; the governance question - who gets access, and under what consent - is still wide open.",
  claims_used: [
    "Modern neuroimaging lets researchers observe neuron activity in real time as the brain forms thoughts.",
    "Decoded brainwave patterns, once analyzed by computer, can already be transcribed into rough words or images.",
  ],
  source_url: MOCK_TEASER.sourceUrl,
};
