import { parseArgs, runCli } from "../args.ts";
import { voiceFromScriptFile } from "../voice.ts";

runCli(async () => {
  const { pos, flags } = parseArgs();
  if (!pos[0]) throw new Error("usage: npx tsx src/cli/voice.ts out/<slug>/script-<lang>.json [--audio existing.mp3 | --silent]");
  const r = await voiceFromScriptFile(pos[0], { audio: flags.audio, silent: "silent" in flags });
  console.log(JSON.stringify({ audio: r.audio, captions: r.captions, estimated: r.data.estimated, words: r.data.words.length }));
});
