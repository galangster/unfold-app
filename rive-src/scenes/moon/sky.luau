--!strict
-- Star field with breathing twinkle, occasional shooting stars with fading tails, and stardust sinking below the moon.
type Star = { x: number, y: number, r: number, phase: number, rate: number, base: number }
type Shot = { x: number, y: number, vx: number, vy: number, age: number, life: number, trail: { number } }
type Dust = { x: number, y: number, vy: number, drift: number, age: number, life: number, r: number }
type Sky = { accent: Input<Color>, t: number, stars: { Star }, shots: { Shot }, dust: { Dust }, paint: Paint, fillPaint: Paint, nextShot: number, nextDust: number }

local function rand(a: number, b: number): number return a + math.random() * (b - a) end
local function circle(p: Path, x: number, y: number, r: number)
    local k = 0.5523 * r
    p:moveTo(Vector.xy(x + r, y))
    p:cubicTo(Vector.xy(x + r, y + k), Vector.xy(x + k, y + r), Vector.xy(x, y + r))
    p:cubicTo(Vector.xy(x - k, y + r), Vector.xy(x - r, y + k), Vector.xy(x - r, y))
    p:cubicTo(Vector.xy(x - r, y - k), Vector.xy(x - k, y - r), Vector.xy(x, y - r))
    p:cubicTo(Vector.xy(x + k, y - r), Vector.xy(x + r, y - k), Vector.xy(x + r, y))
    p:close()
end

local function init(self: Sky, context: Context): boolean
    self.paint = Paint.with({ style = 'stroke', cap = 'round', join = 'round', thickness = 0.8, color = Color.rgb(200, 165, 92) })
    self.fillPaint = Paint.with({ style = 'fill', color = Color.rgb(200, 165, 92) })
    for i = 1, 70 do
        local x, y = rand(10, 380), rand(20, 470)
        if (x - 262) ^ 2 + (y - 222) ^ 2 > 95 ^ 2 then
            table.insert(self.stars, { x = x, y = y, r = rand(0.5, 1.6), phase = rand(0, 6.28), rate = rand(0.25, 0.9), base = rand(0.25, 0.7) })
        end
    end
    return true
end

local function advance(self: Sky, seconds: number): boolean
    self.t += seconds
    self.nextShot -= seconds
    if self.nextShot <= 0 then
        self.nextShot = rand(9, 22)
        local x = rand(30, 330)
        table.insert(self.shots, { x = x, y = rand(30, 150), vx = rand(110, 170), vy = rand(30, 55), age = 0, life = rand(0.9, 1.4), trail = {} :: { number } })
    end
    for i = #self.shots, 1, -1 do
        local s = self.shots[i]
        s.age += seconds
        s.x += s.vx * seconds; s.y += s.vy * seconds
        table.insert(s.trail, 1, s.x); table.insert(s.trail, 2, s.y)
        if #s.trail > 28 then table.remove(s.trail); table.remove(s.trail) end
        if s.age > s.life then table.remove(self.shots, i) end
    end
    self.nextDust -= seconds
    if self.nextDust <= 0 then
        self.nextDust = rand(0.25, 0.7)
        table.insert(self.dust, { x = rand(150, 370), y = rand(230, 330), vy = rand(6, 14), drift = rand(-4, 4), age = 0, life = rand(6, 11), r = rand(0.6, 1.5) })
    end
    for i = #self.dust, 1, -1 do
        local d = self.dust[i]
        d.age += seconds; d.y += d.vy * seconds; d.x += (d.drift + math.sin(self.t * 0.7 + d.y * 0.05) * 3) * seconds
        if d.age > d.life then table.remove(self.dust, i) end
    end
    return true
end

local function draw(self: Sky, renderer: Renderer)
    local base = self.accent
    for _, s in self.stars do
        local tw = s.base + 0.3 * math.sin(self.t * s.rate + s.phase)
        local p = Path.new(); circle(p, s.x, s.y, s.r)
        self.fillPaint.color = Color.alpha(base, math.floor(255 * math.max(0.05, tw)))
        renderer:drawPath(p, self.fillPaint)
        if s.r > 1.3 then  -- four-point glint on the brightest
            local g = Path.new(); local L = s.r * 4 * tw
            g:moveTo(Vector.xy(s.x - L, s.y)); g:lineTo(Vector.xy(s.x + L, s.y)); g:moveTo(Vector.xy(s.x, s.y - L)); g:lineTo(Vector.xy(s.x, s.y + L))
            self.paint.thickness = 0.5; self.paint.feather = 0; self.paint.color = Color.alpha(base, math.floor(255 * 0.35 * tw))
            renderer:drawPath(g, self.paint)
        end
    end
    for _, s in self.shots do
        local fade = 1 - s.age / s.life
        local n = #s.trail // 2
        for k = 1, n - 1 do
            local seg = Path.new()
            seg:moveTo(Vector.xy(s.trail[2 * k - 1], s.trail[2 * k])); seg:lineTo(Vector.xy(s.trail[2 * k + 1], s.trail[2 * k + 2]))
            local a = fade * (1 - k / n)
            self.paint.thickness = 1.4 * (1 - k / n) + 0.3; self.paint.feather = 0
            self.paint.color = Color.alpha(base, math.floor(255 * 0.9 * a))
            renderer:drawPath(seg, self.paint)
        end
    end
    for _, d in self.dust do
        local a = math.sin(math.pi * d.age / d.life) * 0.5
        local p = Path.new(); circle(p, d.x, d.y, d.r)
        self.fillPaint.color = Color.alpha(base, math.floor(255 * a))
        renderer:drawPath(p, self.fillPaint)
    end
end

return function(): Node<Sky>
    return { accent = Color.rgb(200, 165, 92), t = 0, stars = {}, shots = {}, dust = {}, paint = Paint.new(), fillPaint = Paint.new(), nextShot = 4, nextDust = 0.5,
             init = init, advance = advance, draw = draw }
end
