/// Hardcoded example data for DEV_MODE, standing in for a deployed agent
/// and the article-to-micro-content pipeline's output so the dashboard's
/// UI (deploy -> suggest -> approve) can be evaluated without a working
/// dashboard-api/Privy/ENS backend. All post copy below is original
/// writing, inspired by the same short, already-attributed excerpt used in
/// apps/dashboard-api/data/input-article.md (one reader-submitted
/// "Et si...?" scenario about decoding brainwaves, from
/// arbredespossibles.com) - not a translation or reproduction of that
/// source text. Swap for real data once ANTHROPIC_API_KEY and the ENS
/// operator setup are both in place.

export const MOCK_AGENT = {
  id: "dev-mock-agent",
  name: "Alice Technology Syndication Agent",
  ensSubname: "alice-tech.kymacast.eth",
  status: "deployed",
  reputationScore: 84,
};

const SOURCE_URL = "https://arbredespossibles.com/FutursTechno3.html#V187";

export const MOCK_GENERATIONS = [
  {
    id: "dev-mock-gen-1",
    promptVersion: "v1-generic",
    content: {
      short_post:
        "Scientists can already watch neurons fire in real time. The next leap: turning that raw signal into words and pictures a computer can output.",
      three_post_thread: [
        "1/ Brain imaging can already show us neurons firing as we think - that part isn't new.",
        "2/ What's new is decoding: early work already reconstructs rough shapes and syllables from brain signal alone, no speech or typing involved.",
        "3/ The next milestone is turning that decoded signal into something a computer can reliably output as words or images.",
      ],
      linkedin_summary:
        "Neuroimaging already lets researchers observe brain activity in real time. Emerging decoding techniques go a step further, reconstructing rough approximations of words and images directly from that signal - a meaningful step toward brain-computer interfaces that read intent rather than requiring physical input.",
      claims_used: [
        "Modern neuroimaging lets researchers observe neuron activity in real time as the brain forms thoughts.",
        "Decoded brainwave patterns, once analyzed by computer, can already be transcribed into rough words or images.",
      ],
      source_url: SOURCE_URL,
    },
  },
  {
    id: "dev-mock-gen-2",
    promptVersion: "v2-author-tone",
    content: {
      short_post:
        "We've been able to watch neurons fire for decades. We still can't agree on what that activity actually *is* - now we're teaching computers to read it anyway.",
      three_post_thread: [
        "1/ Every 'sci-fi cliché' started as someone's serious research proposal. Today's is brain-wave decoding.",
        "2/ The pitch: point a computer at your neural static, and it hands back a rough word or image. No speech, no typing - just vibes, technically speaking.",
        "3/ The genuinely interesting part isn't the tech. It's that nobody's agreed yet on what 'private thought' means once it stops requiring your cooperation to leak.",
      ],
      linkedin_summary:
        "Brain-wave decoding is quietly moving from lab curiosity to plausible product category. The neuroscience is real and incremental; the interesting open question - who gets to read the output, and under what consent - is not a technical one, and it's the one worth paying attention to.",
      claims_used: [
        "Modern neuroimaging lets researchers observe neuron activity in real time as the brain forms thoughts.",
        "Decoded brainwave patterns, once analyzed by computer, can already be transcribed into rough words or images.",
      ],
      source_url: SOURCE_URL,
    },
  },
  {
    id: "dev-mock-gen-3",
    promptVersion: "v2-source-grounded",
    content: {
      short_post:
        "A speculative scenario worth tracking: what happens once brain activity can be decoded into words and images a computer can output?",
      three_post_thread: [
        "1/ This is a hypothetical, not a settled prediction: today's neuroimaging can observe brain activity in real time as thoughts form - that part is established.",
        "2/ The speculative leap is decoding: the scenario imagines that activity eventually being transcribed into words or images by a computer, a capability still emerging in early research, not yet reliable.",
        "3/ Framed as an open question rather than inevitability: if this matures, what does consent even mean for thoughts that no longer require your cooperation to become legible?",
      ],
      linkedin_summary:
        "This post explores a speculative (not confirmed) scenario about brain-wave decoding. What's established: neuroimaging already lets researchers observe real-time neural activity. What's speculative: that this activity could eventually be reliably decoded into words or images by machine. Presented as a hypothetical worth discussing, not a claim about current capability.",
      claims_used: [
        "Established: modern neuroimaging lets researchers observe neuron activity in real time as the brain forms thoughts.",
        "Speculative scenario, not a current capability claim: brainwave patterns being reliably transcribed into words or images by computer.",
      ],
      source_url: SOURCE_URL,
    },
  },
];

export const MOCK_PENDING_POST = {
  id: "dev-mock-post-1",
  status: "pending",
  teaser: MOCK_GENERATIONS[0].content.short_post,
};
