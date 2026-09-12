--!strict
-- Mist that flows between the ridges: tapered bands born on the left, drifting right, dying out. Plus drifting snow dust.
type Band = { x: number, y: number, w: number, h: number, speed: number, seed: number, depth: number }
type Dust = { x: number, y: number, vx: number, vy: number, age: number, life: number, r: number }
type Mist = { accent: Input<Color>, t: number, bands: { Band }, dust: { Dust }, paint: Paint, fill: Paint, next: number, nextDust: number }
local function rand(a: number, b: number): number return a + math.random() * (b - a) end
local function spawn(self: Mist, x: number)
    local depth = math.random()
    table.insert(self.bands, { x = x, y = rand(300, 445), w = rand(120, 260), h = rand(2, 5), speed = rand(3.5, 7) * (0.6 + depth * 0.8), seed = rand(0, 100), depth = depth })
end
local function init(self: Mist, context: Context): boolean
    self.paint = Paint.with({ style = 'stroke', cap = 'round', join = 'round', thickness = 1, color = Color.rgb(200, 165, 92) })
    self.fill = Paint.with({ style = 'fill', color = Color.rgb(200, 165, 92) })
    for i = 1, 5 do spawn(self, rand(-40, 300)) end
    return true
end
local function advance(self: Mist, seconds: number): boolean
    self.t += seconds
    self.next -= seconds
    if self.next <= 0 then spawn(self, -rand(150, 260)); self.next = rand(5, 9) end
    for i = #self.bands, 1, -1 do
        local b = self.bands[i]; b.x += b.speed * seconds
        if b.x > 440 then table.remove(self.bands, i) end
    end
    self.nextDust -= seconds
    if self.nextDust <= 0 then
        self.nextDust = rand(0.35, 0.9)
        table.insert(self.dust, { x = rand(60, 390), y = rand(120, 280), vx = rand(-9, -3), vy = rand(5, 11), age = 0, life = rand(7, 13), r = rand(0.5, 1.3) })
    end
    for i = #self.dust, 1, -1 do
        local d = self.dust[i]; d.age += seconds; d.x += (d.vx + math.sin(self.t * 0.6 + d.y * 0.04) * 2.5) * seconds; d.y += d.vy * seconds
        if d.age > d.life then table.remove(self.dust, i) end
    end
    return true
end
local function draw(self: Mist, renderer: Renderer)
    local base = self.accent
    for _, b in self.bands do
        local fade = math.min(1, (b.x + b.w + 40) / 120, (440 - b.x) / 90)
        local n = 20; local lx, ly = 0, 0
        for k = 0, n do
            local u = k / n; local px = b.x + u * b.w
            local py = b.y + math.sin(u * math.pi * 1.6 + b.seed + self.t * 0.1) * b.h + math.sin(u * 4.7 + b.seed) * b.h * 0.5
            if k > 0 then
                local seg = Path.new(); seg:moveTo(Vector.xy(lx, ly)); seg:lineTo(Vector.xy(px, py))
                local env = math.sin(math.pi * (u - 0.5 / n))
                self.paint.thickness = 1.2 + 2.2 * env; self.paint.feather = 2.5
                self.paint.color = Color.alpha(base, math.floor(255 * (0.05 + 0.3 * env) * fade * (0.5 + 0.5 * b.depth)))
                renderer:drawPath(seg, self.paint)
            end
            lx, ly = px, py
        end
    end
    for _, d in self.dust do
        local a = math.sin(math.pi * d.age / d.life) * 0.45
        local p = Path.new(); local r = d.r
        p:moveTo(Vector.xy(d.x + r, d.y)); p:cubicTo(Vector.xy(d.x + r, d.y + r), Vector.xy(d.x - r, d.y + r), Vector.xy(d.x - r, d.y)); p:cubicTo(Vector.xy(d.x - r, d.y - r), Vector.xy(d.x + r, d.y - r), Vector.xy(d.x + r, d.y)); p:close()
        self.fill.color = Color.alpha(base, math.floor(255 * a)); renderer:drawPath(p, self.fill)
    end
end
return function(): Node<Mist>
    return { accent = Color.rgb(200, 165, 92), t = 0, bands = {}, dust = {}, paint = Paint.new(), fill = Paint.new(), next = 3, nextDust = 0.5, init = init, advance = advance, draw = draw }
end
