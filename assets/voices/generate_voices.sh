#!/bin/bash

API_KEY="$EXPO_PUBLIC_CARTESIA_KEY"
TEXT="Let the peace of Christ rule in your hearts, since as members of one body you were called to peace."

voices=(
  "katie:694f9389-aac1-45b6-b726-9d9369183238"
  "elena:03496517-369a-4db1-8236-3d3ae459ddf7"
  "marcus:1463a4e1-56a1-4b41-b257-728d56e93605"
  "sophia:00967b2f-88a6-4a31-8153-110a92134b9f"
  "david:3246e36c-ac8c-418d-83cd-4eaad5a3b887"
  "grace:15a9cd88-84b0-4a8b-95f2-5d583b54c72e"
  "michael:a924b0e6-9253-4711-8fc3-5cb8e0188c94"
)

for voice_info in "${voices[@]}"; do
  name="${voice_info%%:*}"
  id="${voice_info##*:}"
  output_file="sample-${name}.mp3"
  
  echo "Generating voice for $name..."
  
  curl -s -X POST "https://api.cartesia.ai/tts/bytes" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -H "Cartesia-Version: 2024-06-10" \
    -d "{
      \"model_id\": \"sonic-2\",
      \"transcript\": \"$TEXT\",
      \"voice\": {
        \"mode\": \"id\",
        \"id\": \"$id\"
      },
      \"output_format\": {
        \"container\": \"mp3\",
        \"sample_rate\": 44100,
        \"bit_rate\": 128000
      }
    }" \
    -o "$output_file"
  
  if [ -f "$output_file" ] && [ -s "$output_file" ]; then
    size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null)
    echo "  ✓ Saved $output_file ($size bytes)"
  else
    echo "  ✗ Failed to generate $output_file"
  fi
done

echo ""
echo "All voices generated!"
ls -la *.mp3
