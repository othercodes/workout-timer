#!/usr/bin/env node

/**
 * Exercise Image Generator - Multi-Model Support
 *
 * Options:
 *   --model=dalle     Use DALL-E 3 with optimized prompts (default)
 *   --model=sdxl      Use Stable Diffusion XL via Replicate (supports seeds)
 *   --reference=FILE  Analyze reference image for style consistency (Option 2)
 *   --force           Regenerate all images
 *   --dry-run         Preview without generating
 *   --test=N          Generate only N images for testing
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import Replicate from 'replicate';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Configuration
const CONFIG = {
  workoutsPath: path.join(ROOT_DIR, 'src/data/workouts.json'),
  outputDir: path.join(ROOT_DIR, 'public/images/exercises'),
  webpQuality: 85,
  sdxlSeed: 42, // Fixed seed for SDXL consistency
};

// Parse CLI arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const MODEL = args.find(a => a.startsWith('--model='))?.split('=')[1] || 'dalle';
const REFERENCE = args.find(a => a.startsWith('--reference='))?.split('=')[1];
const TEST_LIMIT = parseInt(args.find(a => a.startsWith('--test='))?.split('=')[1] || '0');

// Style anchor for consistency (Option 1)
const STYLE_ANCHOR = `
Style: Modern fitness app illustration, clean vector art, similar to Nike Training Club or Peloton app icons.
Color palette: Teal (#0D9488) for body, Coral (#F97316) for clothing, White (#FFFFFF) background.
Art style: Flat design, minimal gradients, clean edges, professional fitness instruction diagram.
`.trim();

let referenceStyleDescription = null;

/**
 * Slugify exercise name for filename
 */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/**
 * Extract unique exercises from workouts
 */
function extractUniqueExercises(workouts) {
  const exercises = new Map();
  for (const workout of workouts.workouts) {
    for (const phase of workout.phases) {
      for (const exercise of phase.exercises) {
        const slug = slugify(exercise.name);
        if (!exercises.has(slug)) {
          exercises.set(slug, {
            name: exercise.name,
            slug,
            instructions: exercise.instructions,
          });
        }
      }
    }
  }
  return Array.from(exercises.values());
}

/**
 * Option 2: Analyze reference image with GPT-4 Vision
 */
async function analyzeReferenceImage(openai, imagePath) {
  console.log(`\n🔍 Analyzing reference image: ${imagePath}`);

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/webp';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Analyze this fitness exercise illustration and describe its EXACT visual style in detail. I need to recreate this EXACT style for other exercise images.

Describe:
1. Art style (vector, flat, realistic, etc.)
2. Color palette (list exact colors you see)
3. Figure style (silhouette, detailed, proportions)
4. Background style
5. Line work (thick, thin, none)
6. Shading style
7. Overall composition
8. Any unique characteristics

Format your response as a style guide that can be copy-pasted into an image generation prompt.`
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` }
        }
      ]
    }],
    max_tokens: 1000,
  });

  const styleDescription = response.choices[0].message.content;
  console.log('\n📋 Extracted style description:');
  console.log(styleDescription);
  console.log('\n');

  return styleDescription;
}

/**
 * Step 1: Use GPT to analyze exercise and define poses
 */
async function analyzeExercise(openai, exercise) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Describe the TWO key positions for "${exercise.name}" exercise.

Instructions: ${exercise.instructions?.join('. ') || 'Standard form'}

Return JSON:
{
  "name": "Exercise name in English",
  "start": "Starting position: exact body pose description",
  "end": "Ending position: exact body pose description (must be DIFFERENT from start)",
  "camera": "side" or "front"
}

Be specific about body angles, arm positions, leg positions. The two poses must be visually distinct.`
    }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  return JSON.parse(response.choices[0].message.content);
}

/**
 * Build prompt for DALL-E 3 (Option 1 optimized)
 */
function buildDallePrompt(poseData) {
  const styleGuide = referenceStyleDescription || STYLE_ANCHOR;

  return `Create a fitness exercise instruction illustration.

EXACT COMPOSITION (must follow precisely):
- Pure white background (#FFFFFF), completely empty
- EXACTLY 2 figures of the same person, side by side
- LEFT figure: ${poseData.start}
- RIGHT figure: ${poseData.end}
- Small arrow between figures showing movement direction
- Camera angle: ${poseData.camera} view

FIGURE APPEARANCE (identical for both figures):
- Athletic person, gender-neutral appearance
- Body colored in solid teal (#0D9488)
- Wearing coral/orange (#F97316) fitted t-shirt and knee-length shorts
- White athletic shoes
- Simple ponytail hairstyle
- Minimal facial features, just basic profile shape
- Clean, simplified anatomy

${styleGuide}

STRICT RULES:
- EXACTLY 2 figures, no more, no less
- Both figures must show DIFFERENT body positions
- No text, labels, numbers, or watermarks
- No background objects, equipment, or devices
- No additional people or floating body parts
- Keep it simple and clean like a fitness app icon`;
}

/**
 * Build prompt for Stable Diffusion XL (Option 3)
 */
function buildSDXLPrompt(poseData) {
  return `fitness exercise instruction diagram, ${poseData.name}, two figures side by side showing exercise progression, left figure in starting position: ${poseData.start}, right figure in ending position: ${poseData.end}, ${poseData.camera} view, flat vector illustration style, solid white background, teal colored athletic figure, coral orange workout clothes, minimal clean design, fitness app icon style, professional instruction manual illustration, no text, no labels`;
}

/**
 * Generate image with DALL-E 3
 */
async function generateWithDalle(openai, prompt) {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    style: 'natural', // Changed from 'vivid' for more consistency
  });
  return response.data[0].url;
}

/**
 * Generate image with Stable Diffusion XL (Option 3)
 */
async function generateWithSDXL(replicate, prompt) {
  const output = await replicate.run(
    "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
    {
      input: {
        prompt: prompt,
        negative_prompt: "text, labels, numbers, watermark, signature, blurry, distorted, extra limbs, extra figures, three people, one person, realistic photo, photograph, multiple frames, collage, phone, device, mirror",
        width: 1024,
        height: 1024,
        num_outputs: 1,
        seed: CONFIG.sdxlSeed, // Fixed seed for consistency!
        num_inference_steps: 30,
        guidance_scale: 7.5,
        scheduler: "K_EULER",
      }
    }
  );
  return output[0];
}

/**
 * Download image and convert to WebP
 */
async function downloadAndConvert(url, outputPath) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await sharp(buffer)
    .webp({ quality: CONFIG.webpQuality })
    .toFile(outputPath);
}

/**
 * Process single exercise
 */
async function processExercise(openai, replicate, exercise, outputPath) {
  // Step 1: Analyze exercise
  console.log(`     📝 Analyzing...`);
  const poseData = await analyzeExercise(openai, exercise);

  // Step 2: Generate image based on model
  console.log(`     🎨 Generating (${MODEL})...`);
  let imageUrl;

  if (MODEL === 'sdxl') {
    const prompt = buildSDXLPrompt(poseData);
    imageUrl = await generateWithSDXL(replicate, prompt);
  } else {
    const prompt = buildDallePrompt(poseData);
    imageUrl = await generateWithDalle(openai, prompt);
  }

  // Step 3: Download and convert
  console.log(`     💾 Saving...`);
  await downloadAndConvert(imageUrl, outputPath);

  return poseData;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🏋️  Exercise Image Generator\n');
  console.log(`   Model: ${MODEL.toUpperCase()}`);
  if (REFERENCE) console.log(`   Reference: ${REFERENCE}`);
  if (TEST_LIMIT) console.log(`   Test mode: ${TEST_LIMIT} images`);
  console.log('');

  // Check API keys
  if (!DRY_RUN) {
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY required');
      process.exit(1);
    }
    if (MODEL === 'sdxl' && !process.env.REPLICATE_API_TOKEN) {
      console.error('❌ REPLICATE_API_TOKEN required for SDXL model');
      console.error('   Get your token at: https://replicate.com/account/api-tokens');
      process.exit(1);
    }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const replicate = MODEL === 'sdxl' ? new Replicate({ auth: process.env.REPLICATE_API_TOKEN }) : null;

  // Option 2: Analyze reference image if provided
  if (REFERENCE && !DRY_RUN) {
    const refPath = path.resolve(ROOT_DIR, REFERENCE);
    if (!fs.existsSync(refPath)) {
      console.error(`❌ Reference image not found: ${refPath}`);
      process.exit(1);
    }
    referenceStyleDescription = await analyzeReferenceImage(openai, refPath);
  }

  // Load workouts
  console.log('📖 Loading workouts...');
  const workoutsJson = fs.readFileSync(CONFIG.workoutsPath, 'utf-8');
  const workouts = JSON.parse(workoutsJson);

  const exercises = extractUniqueExercises(workouts);
  console.log(`   Found ${exercises.length} unique exercises\n`);

  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  // Filter exercises to generate
  let toGenerate = exercises.filter(ex => {
    const outputPath = path.join(CONFIG.outputDir, `${ex.slug}.webp`);
    const exists = fs.existsSync(outputPath);
    if (exists && !FORCE) {
      console.log(`⏭️  Skip: ${ex.name}`);
      return false;
    }
    return true;
  });

  // Apply test limit
  if (TEST_LIMIT > 0) {
    toGenerate = toGenerate.slice(0, TEST_LIMIT);
  }

  if (toGenerate.length === 0) {
    console.log('\n✅ All images exist. Use --force to regenerate.');
    return;
  }

  console.log(`\n🎨 Will generate ${toGenerate.length} images\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN:');
    toGenerate.forEach(ex => console.log(`   - ${ex.slug}.webp`));
    return;
  }

  let generated = 0;
  let failed = 0;

  // Process sequentially for better consistency
  for (const exercise of toGenerate) {
    const outputPath = path.join(CONFIG.outputDir, `${exercise.slug}.webp`);
    console.log(`\n[${generated + failed + 1}/${toGenerate.length}] ${exercise.name}`);

    try {
      await processExercise(openai, replicate, exercise, outputPath);
      console.log(`  ✅ Done: ${exercise.slug}.webp`);
      generated++;
    } catch (error) {
      console.error(`  ❌ Failed: ${error.message}`);
      failed++;
    }

    // Small delay between requests
    if (generated + failed < toGenerate.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Generated: ${generated}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📁 Output: ${CONFIG.outputDir}\n`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
