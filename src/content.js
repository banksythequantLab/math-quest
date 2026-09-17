// Authored story content. The engine picks from this; Nemotron writes the prose inside it.
// Rule: structure is authored, words are generated. Every scene has a place, a hook, a role for the monster, and a clue.

export const LOCATIONS = {
  gate:    { name: "the Grove Gate",        look: "a mossy stone archway wrapped in glowing blue mushrooms, fireflies drifting, twilight" },
  hollow:  { name: "the Mushroom Hollow",   look: "a sunken clearing of giant red-capped mushrooms, spotted light, soft green fog" },
  bridge:  { name: "the Crooked Bridge",    look: "a rickety rope bridge over a sparkling waterfall gorge, rainbow mist" },
  caves:   { name: "the Whispering Caves",  look: "a cave of glowing purple crystals and dripping stalactites, echoes" },
  meadow:  { name: "the Fog Meadow",        look: "a moonlit meadow of tall silver grass and floating dandelion seeds, low fog" },
  throne:  { name: "the Goblin King's Throne Room", look: "a wonky underground throne room piled with stolen junk, a crooked throne of spoons and teacups, torchlight" },
};
export const PATH = ["gate", "hollow", "bridge", "caves", "meadow", "throne"];

// Each monster: a name, a personality, a want, a voice. The DM plays them, not a generic 'goblin'.
export const CAST = {
  goblin:    { name: "Snib",              persona: "a jittery goblin lookout who talks fast and loves shiny buttons", want: "a shiny button", voice: "squeaky and quick" },
  orc:       { name: "Gruntilda",         persona: "a big bossy orc who pretends to be scary but is mostly hungry", want: "a sandwich", voice: "deep and booming" },
  troll:     { name: "Old Mossbeard",     persona: "a slow sleepy troll who has guarded this spot for a hundred years and is very proud of it", want: "someone to admire his flower", voice: "slow and rumbly" },
  slime:     { name: "Blorp",             persona: "a bouncy cheerful slime who cannot stop giggling and copies everything you say", want: "a friend", voice: "wobbly and happy" },
  bat:       { name: "Flitwick",          persona: "a nervous bat spy who reports to the Goblin King and is terrible at keeping secrets", want: "to not get in trouble", voice: "whispery and jumpy" },
  mushroom:  { name: "Cap",               persona: "a polite mushroom person who insists everyone follow the Grove rules", want: "for you to say please", voice: "prim and proper" },
  skeleton:  { name: "Rattles",           persona: "a clumsy skeleton who keeps losing bones and is embarrassed about it", want: "help finding his missing toe bone", voice: "clattery and sheepish" },
  gloomfang: { name: "the Gloomfang",     persona: "a shadowy many-legged lurker who speaks in riddles of the dark and is secretly lonely", want: "someone to sit in the dark with it", voice: "slow, hissing whisper" },
  kobold:    { name: "Pip",               persona: "a tiny kobold in pots-and-pans armor who thinks she is the greatest knight alive", want: "a worthy duel", voice: "loud and heroic" },
  wolf:      { name: "Grizzle",           persona: "a gruff wolf who guards the bridge toll and takes his job far too seriously", want: "the toll paid", voice: "growly and official" },
  ogre:      { name: "Big Bruno",         persona: "a gentle giant ogre who is always eating and never finishes a sentence", want: "one more bite", voice: "mumbly, mouth full" },
  golem:     { name: "Pebble",            persona: "a stone golem made of stacked rocks who speaks one word at a time and forgets what it was guarding", want: "to remember", voice: "grinding, one word at a time" },
  harpy:     { name: "Screech",           persona: "a showoff harpy who sings everything and demands applause", want: "applause", voice: "sing-song" },
  ghost:     { name: "Boo-Boo",           persona: "a tiny ghost who is scared of YOU and hides behind things", want: "to not be scary", voice: "tiny and trembling" },
  gnome:     { name: "Gnorman",           persona: "a grumpy garden gnome whose tulips keep getting trampled by adventurers", want: "his tulips watered", voice: "grumbly and cranky" },
  wyrmling:  { name: "Puff",              persona: "a baby dragon with the hiccups who accidentally sets small things on fire and apologizes a lot", want: "a cure for hiccups", voice: "cute with hiccups" },
  minotaur:  { name: "Moose",             persona: "a huge minotaur who is actually lost and too proud to ask for directions", want: "directions, secretly", voice: "gruff but confused" },
  lich:      { name: "Professor Dustbones", persona: "an ancient lich who is really just a very old teacher who misses having students", want: "someone to listen to his story", voice: "creaky and dramatic" },
  mimic:     { name: "Chompers",          persona: "a treasure-chest mimic who plays dead until you get close, then blurts out surprises", want: "to surprise someone", voice: "sudden and gleeful" },
  king:      { name: "the Goblin King",   persona: "a small goblin on a big throne who steals things because nobody ever invites him to anything", want: "to be invited", voice: "grand and whiny" },
};

// Campaigns: 6 authored beats. `role` = why THIS scene's monster matters to the quest.
// `clue` is revealed when the scene is cleared and accumulates into the story.
// Monster for each beat is picked by band from the pool (boss fixed).
export const CAMPAIGNS = [
  { id: "bell", title: "The Stolen Bell", reward: "the Village Bell",
    goal: "The Goblin King stole the village bell. Without it, nobody can ring in the Harvest Feast tonight!",
    beats: [
      { role: "The monster saw the thief run past and is too flustered to say which way.", clue: "The thief went UNDER the grove, not over it." },
      { role: "The monster found a scrap of the bell's red ribbon and is wearing it proudly.", clue: "The bell's ribbon was torn on a crooked bridge." },
      { role: "The monster charges a toll to cross and won't say who paid it last.", clue: "A goblin paid the toll with a spoon — the King loves spoons." },
      { role: "The monster's echo-cave repeats a faint 'ding' from somewhere deeper.", clue: "The bell still rings — it's hidden somewhere hollow." },
      { role: "The monster is sad because the Feast might be cancelled.", clue: "The King's throne room is right under the meadow." },
      { role: "The Goblin King has the bell and is using it as a hat.", clue: "" },
    ] },
  { id: "lantern", title: "The Dark Lanterns", reward: "the Ember Stone",
    goal: "Every lantern in Willowdale went dark. The Goblin King took the Ember Stone that lights them all.",
    beats: [
      { role: "The monster is scared of the dark and keeps bumping into things.", clue: "The Ember Stone glows through cloth — look for a glowing sack." },
      { role: "The monster's mushrooms are glowing brighter than usual.", clue: "The Stone passed through here; it charges up anything it touches." },
      { role: "The monster saw a glowing sack bounce across the bridge.", clue: "The thief dropped one lantern in the gorge — the King is clumsy." },
      { role: "The monster's crystals are pulsing warm — something hot came through.", clue: "The Stone is getting warmer. He's keeping it close." },
      { role: "The monster can see the throne room glow from the meadow.", clue: "The King is using the Stone as a night-light. He's afraid of the dark too." },
      { role: "The Goblin King clutches the Ember Stone and refuses to sleep without it.", clue: "" },
    ] },
  { id: "recipe", title: "Grandma Fig's Recipe", reward: "Grandma Fig's secret pie recipe",
    goal: "The Goblin King stole Grandma Fig's secret pie recipe. The Grove Bake-Off is tomorrow!",
    beats: [
      { role: "The monster smells like cinnamon and is acting suspicious.", clue: "The thief is trailing cinnamon — follow your nose." },
      { role: "The monster is trying to bake with the wrong ingredients and it's going badly.", clue: "The King can't read the recipe — he's looking for someone to read it to him." },
      { role: "The monster found a torn corner of the recipe: 'a pinch of...'", clue: "The recipe is in pieces. He tore it while running." },
      { role: "The monster has been tasting something delicious echoing from below.", clue: "Someone is baking in the throne room. Badly." },
      { role: "The monster wants to enter the Bake-Off too and asks for tips.", clue: "The King entered the Bake-Off under a fake name: 'Gob Lin'." },
      { role: "The Goblin King is covered in flour, holding the recipe, about to burn a pie.", clue: "" },
    ] },
];
