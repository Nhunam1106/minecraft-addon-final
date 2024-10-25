execute if entity @s[tag=!spark_disasters.meteor_large] run particle spark_disasters:explosion_sparks ~ ~0.3 ~
execute if entity @s[tag=!spark_disasters.meteor_large] run particle spark_disasters:explosion_melt ~ ~0.3 ~
execute if entity @s[tag=!spark_disasters.meteor_large] run particle spark_disasters:explosion_rings ~ ~0.3 ~
execute if entity @s[tag=!spark_disasters.meteor_large] run particle spark_disasters:explosion_smoke ~ ~0.3 ~

execute if entity @s[tag=spark_disasters.meteor_large] run particle spark_disasters:explosion_sparks_large ~ ~0.3 ~
execute if entity @s[tag=spark_disasters.meteor_large] run particle spark_disasters:explosion_melt_large ~ ~0.3 ~
execute if entity @s[tag=spark_disasters.meteor_large] run particle spark_disasters:explosion_rings_large ~ ~0.3 ~
execute if entity @s[tag=spark_disasters.meteor_large] run particle spark_disasters:explosion_smoke_large ~ ~0.3 ~
execute if entity @s[tag=spark_disasters.meteor_large] run particle spark_disasters:explosion_dust_large ~ ~0.3 ~

# structure
# execute if entity @s[tag=spark_disasters.meteor_large] run scoreboard objectives add spark_disasters.random dummy
# execute if entity @s[tag=spark_disasters.meteor_large] run scoreboard players random @s spark_disasters.random 0 30
# execute if entity @s[tag=spark_disasters.meteor_large,scores={spark_disasters.random=0}] run structure load spark:m1 ~-3 ~ ~-3 0_degrees none 
# execute if entity @s[tag=spark_disasters.meteor_large,scores={spark_disasters.random=1}] run structure load spark:m2 ~-3 ~ ~-3 0_degrees none 
# execute if entity @s[tag=spark_disasters.meteor_large,scores={spark_disasters.random=2}] run structure load spark:m3 ~-3 ~ ~-3 0_degrees none 
# execute if entity @s[tag=spark_disasters.meteor_large,scores={spark_disasters.random=3}] run structure load spark:m4 ~-3 ~ ~-3 0_degrees none 
# execute if entity @s[tag=spark_disasters.meteor_large,scores={spark_disasters.random=4}] run structure load spark:m5 ~-3 ~ ~-3 0_degrees none 
# execute if entity @s[tag=spark_disasters.meteor_large,scores={spark_disasters.random=5}] run structure load spark:m6 ~-4 ~ ~-3 0_degrees none 
execute if entity @s[tag=spark_disasters.meteor_large] run scriptevent spark_disasters:explode_large

# screenshake
execute if entity @s[tag=spark_disasters.meteor_small] run camerashake add @a[r=50] 0.03 0.12 rotational
execute if entity @s[tag=spark_disasters.meteor_small] run camerashake add @a[r=30] 0.06 0.15 rotational
execute if entity @s[tag=spark_disasters.meteor_small] run camerashake add @a[r=16] 0.10 0.20 rotational

execute if entity @s[tag=spark_disasters.meteor_medium] run camerashake add @a[r=55] 0.05 0.14 rotational
execute if entity @s[tag=spark_disasters.meteor_medium] run camerashake add @a[r=38] 0.09 0.18 rotational
execute if entity @s[tag=spark_disasters.meteor_medium] run camerashake add @a[r=18] 0.13 0.22 rotational

execute if entity @s[tag=spark_disasters.meteor_large] run camerashake add @a[r=62] 0.08 0.3 rotational
execute if entity @s[tag=spark_disasters.meteor_large] run camerashake add @a[r=44] 0.12 0.3 rotational
execute if entity @s[tag=spark_disasters.meteor_large] run camerashake add @a[r=28] 0.2 0.3 rotational
execute if entity @s[tag=spark_disasters.meteor_large] run camerashake add @a[r=23] 0.12 0.60 rotational

# sounds
execute if entity @s[tag=spark_disasters.meteor_small] as @s run playsound random.explode @a[r=129] ~ ~ ~ 8 1 1
execute if entity @s[tag=spark_disasters.meteor_medium] as @s run playsound random.explode @a[r=129] ~ ~ ~ 8 1 1
execute if entity @s[tag=spark_disasters.meteor_large] as @s run playsound random.explode @a[r=129] ~ ~ ~ 8 1 1
execute if entity @s[tag=spark_disasters.meteor_small] as @s run playsound random.explode @a[r=129] ~ ~ ~ 
execute if entity @s[tag=spark_disasters.meteor_medium] as @s run playsound random.explode @a[r=129] ~ ~ ~ 
execute if entity @s[tag=spark_disasters.meteor_large] as @s run playsound random.explode @a[r=129] ~ ~ ~ 