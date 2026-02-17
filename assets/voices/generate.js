const fs = require('fs');
const path = require('path');

// Read API key from various sources
function getApiKey() {
  // Try environment variable first
  if (process.env.EXPO_PUBLIC_CARTESIA_KEY) {
    return process.env.EXPO_PUBLIC_CARTESIA_KEY;
  }
  
  // Try reading from shell environment
  try {
    const { execSync } = require('child_process');
    const env = execSync('env', { encoding: 'utf8' });
    const match = env.match(/EXPO_PUBLIC_CARTESIA_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch (e) {}
  
  throw new Error('EXPO_PUBLIC_CARTESIA_KEY not found in environment');
}

const VOICES = [
  { name: 'katie', id: '694f9389-aac1-45b6-b726-9d9369183238' },
  { name: 'elena', id: '03496517-369a-4db1-8236-3d3ae459ddf7' },
  { name: 'marcus', id: '1463a4e1-56a1-4b41-b257-728d56e93605' },
  { name: 'sophia', id: '00967b2f-88a6-4a31-8153-110a92134b9f' },
  { name: 'david', id: '3246e36c-ac8c-418d-83cd-4eaad5a3b887' },
  { name: 'grace', id: '15a9cd88-84b0-4a8b-95f2-5d583b54c72e' },
  { name: 'michael', id: 'a924b0e6-9253-4711-8fc3-5cb8e0188c94' },
];

const TEXT = "Let the peace of Christ rule in your hearts, since as members of one body you were called to peace.";
const OUTPUT_DIR = '/Users/galangster/clawd/work/unfold/app/mobile/assets/voices';

async function generateVoice(voice, apiKey) {
  const outputFile = path.join(OUTPUT_DIR, `sample-${voice.name}.mp3`);
  
  console.log(`Generating voice for ${voice.name}...`);
  
  try {
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2024-06-10',
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-2',
        transcript: TEXT,
        voice: {
          mode: 'id',
          id: voice.id,
        },
        output_format: {
          container: 'mp3',
          sample_rate: 44100,
          bit_rate: 128000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    fs.writeFileSync(outputFile, Buffer.from(audioBuffer));
    
    const size = fs.statSync(outputFile).size;
    console.log(`  ✓ Saved sample-${voice.name}.mp3 (${size} bytes)`);
    return { success: true, name: voice.name, size };
  } catch (error) {
    console.log(`  ✗ Failed to generate ${voice.name}: ${error.message}`);
    return { success: false, name: voice.name, error: error.message };
  }
}

async function main() {
  let apiKey;
  try {
    apiKey = getApiKey();
    console.log('API key found');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Generating ${VOICES.length} voice samples...\n`);
  
  const results = [];
  for (const voice of VOICES) {
    const result = await generateVoice(voice, apiKey);
    results.push(result);
  }

  console.log('\n--- Summary ---');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`Generated: ${successful.length}/${VOICES.length}`);
  
  if (failed.length > 0) {
    console.log(`\nFailed:`);
    failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }
  
  console.log('\nFiles in output directory:');
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.mp3'));
  files.forEach(f => {
    const stats = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`  ${f} (${stats.size} bytes)`);
  });
}

main().catch(console.error);
