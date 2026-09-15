--!strict
-- Drifting wisps that cross the moon: born at the right, die at the left, never repeat.
type Wisp = { x: number, y: number, w: number, h: number, speed: number, life: number, age: number, seed: number }
type Clouds = { accent: Input<Color>, t: number, wisps: { Wisp }, path: Path, paint: Paint, next: number }

local function rand(a: number, b: number): number return a + math.random() * (b - a) end

local function spawn(self: Clouds)
    table.insert(self.wisps, {
        x = 420 + rand(0, 120), y = rand(150, 330), w = rand(150, 280), h = rand(3, 7),
        speed = rand(5, 9), life = 0, age = 0, seed = rand(0, 100),
    })
end

local function advance(self: Clouds, seconds: number): boolean
    self.t += seconds
    self.next -= seconds
    if self.next <= 0 then spawn(self); self.next = rand(6, 11) end
    for i = #self.wisps, 1, -1 do
        local w = self.wisps[i]
        w.x -= w.speed * seconds
        w.age += seconds
        if w.x + w.w < -40 then table.remove(self.wisps, i) end
    end
    return true
end

local function band(self: Clouds, renderer: Renderer, w: Wisp, base: Color, yoff: number, scale: number, fade: number)
    -- one tapered line: thickness and alpha follow a sine along the length, drawn as short segments
    local n = 22
    local lx, ly = 0, 0
    for k = 0, n do
        local u = k / n
        local px = w.x + u * w.w
        local py = w.y + yoff + (math.sin(u * math.pi * 2 + w.seed + self.t * 0.12) * w.h + math.sin(u * 5.3 + w.seed * 0.7) * w.h * 0.45) * scale
        if k > 0 then
            local seg = Path.new(); seg:moveTo(Vector.xy(lx, ly)); seg:lineTo(Vector.xy(px, py))
            local env = math.sin(math.pi * (u - 0.5 / n))
            self.paint.thickness = 0.35 + 1.15 * env * scale
            self.paint.feather = 0
            self.paint.color = Color.alpha(base, math.floor(255 * (0.15 + 0.5 * env) * fade * scale))
            renderer:drawPath(seg, self.paint)
        end
        lx, ly = px, py
    end
end

local function draw(self: Clouds, renderer: Renderer)
    local base = self.accent
    for _, w in self.wisps do
        local fade = math.min(1, (430 - w.x) / 70, (w.x + w.w + 40) / 90)
        band(self, renderer, w, base, 0, 1, fade)
        band(self, renderer, w, base, w.h * 1.4, 0.55, fade)   -- fainter companion below, shorter reach
    end
end

local function init(self: Clouds, context: Context): boolean
    self.paint = Paint.with({ style = 'stroke', cap = 'round', join = 'round', thickness = 1, color = Color.rgb(200, 165, 92) })
    for i = 1, 3 do spawn(self); self.wisps[i].x = rand(-20, 300) end
    return true
end

return function(): Node<Clouds>
    return { accent = Color.rgb(200, 165, 92), t = 0, wisps = {}, path = Path.new(), paint = Paint.new(), next = 1,
             init = init, advance = advance, draw = draw }
end
