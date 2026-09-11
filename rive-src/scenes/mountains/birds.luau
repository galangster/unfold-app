--!strict
-- A small flock crosses the sky now and then: tiny two-arc birds with a slow flap, staggered in a loose V.
type Bird = { dx: number, dy: number, phase: number, size: number }
type Flock = { x: number, y: number, vx: number, vy: number, birds: { Bird }, age: number }
type Birds = { accent: Input<Color>, t: number, flock: Flock?, next: number, paint: Paint }
local function rand(a: number, b: number): number return a + math.random() * (b - a) end
local function init(self: Birds, context: Context): boolean
    self.paint = Paint.with({ style = 'stroke', cap = 'round', join = 'round', thickness = 0.7, color = Color.rgb(200, 165, 92) })
    return true
end
local function advance(self: Birds, seconds: number): boolean
    self.t += seconds
    local f = self.flock
    if f == nil then
        self.next -= seconds
        if self.next <= 0 then
            local birds = {} :: { Bird }
            local n = math.random(3, 6)
            for i = 1, n do table.insert(birds, { dx = -i * rand(9, 14), dy = (i % 2 == 0 and 1 or -1) * i * rand(3, 6), phase = rand(0, 6.28), size = rand(3, 4.5) }) end
            local up = math.random() < 0.5
            self.flock = { x = 440, y = rand(90, 200), vx = -rand(14, 20), vy = up and -rand(1, 3) or rand(1, 3), birds = birds, age = 0 }
        end
    else
        f.age += seconds; f.x += f.vx * seconds; f.y += f.vy * seconds + math.sin(self.t * 0.5) * 2 * seconds
        if f.x < -120 then self.flock = nil; self.next = rand(20, 40) end
    end
    return true
end
local function draw(self: Birds, renderer: Renderer)
    local f = self.flock
    if f == nil then return end
    local base = self.accent
    local fade = math.min(1, (440 - f.x) / 60, (f.x + 100) / 60)
    for _, b in f.birds do
        local x, y = f.x + b.dx, f.y + b.dy
        local flap = math.sin(self.t * 5 + b.phase) * b.size * 0.55
        local p = Path.new()
        p:moveTo(Vector.xy(x - b.size, y + flap)); p:cubicTo(Vector.xy(x - b.size * 0.5, y - b.size * 0.15), Vector.xy(x - b.size * 0.2, y), Vector.xy(x, y))
        p:cubicTo(Vector.xy(x + b.size * 0.2, y), Vector.xy(x + b.size * 0.5, y - b.size * 0.15), Vector.xy(x + b.size, y + flap))
        self.paint.color = Color.alpha(base, math.floor(255 * 0.7 * fade)); self.paint.thickness = 0.7
        renderer:drawPath(p, self.paint)
    end
end
return function(): Node<Birds>
    return { accent = Color.rgb(200, 165, 92), t = 0, flock = nil, next = 6, paint = Paint.new(), init = init, advance = advance, draw = draw }
end
