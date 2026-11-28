/* Change exercise definitions here. Saved sessions retain their original snapshot. */
(() => {
  'use strict';
  const media = (sheet, row, extra = {}) => ({ sheet, row, ...extra });
  const EX = {
    march: {
      name: 'Easy marching', mode: 'time', seconds: 120, target: '2 minutes',
      media: media('warmup', 0),
      steps: ['Stand tall near a stable counter. Start with both feet down.', 'Lift one knee and foot a little. Lower the foot, then change legs.', 'Use small, comfortable steps. Start slowly and breathe normally.'],
      search: 'NHS gentle marching on the spot exercise'
    },
    rolls: {
      name: 'Shoulder rolls', mode: 'reps', reps: 10, target: '5 rolls each way',
      media: media('rolls', 0, { rows: 1 }),
      steps: ['Let your arms hang loosely. Gently lift both shoulders toward your ears.', 'Roll your shoulders back, then relax them down.', 'Do 5 gentle rolls, then reverse the direction.'],
      search: 'NHS shoulder rolls exercise'
    },
    ankles: {
      name: 'Ankle pumps', mode: 'reps', reps: 10, target: '10 gentle pumps',
      media: media('warmup', 2),
      steps: ['Sit on a sturdy chair. Move your feet slightly forward.', 'Point your toes gently away.', 'Pull your toes back toward your shins.'],
      search: 'NHS seated ankle pumps exercise'
    },
    catcow: {
      name: 'Cat-cow', mode: 'physio', target: 'Follow your physio’s sets and reps',
      media: media('floor', 0),
      steps: ['Use the position and movement your physio showed you.', 'On hands and knees, gently round and release your back.', 'Make small movements. Do not deeply arch your back. Breathe normally.'],
      search: 'NHS physiotherapy cat cow exercise'
    },
    pelvic: {
      name: 'Pelvic tilt', mode: 'physio', target: 'Follow your physio’s sets and reps',
      media: media('pelvic', 0, { rows: 1 }),
      steps: ['Lie on your back with knees bent and feet flat.', 'Gently tip your pelvis so your lower back meets the mat, then relax.', 'Keep your hips down. Do not force the movement. Follow your physio’s dose.'],
      search: 'NHS lying pelvic tilt exercise'
    },
    pushup: {
      name: 'Wall push-up', mode: 'reps', reps: 6, target: '6–10 reps',
      media: media('strength', 0),
      steps: ['Hands on the wall at chest height.', 'Bend your elbows. Keep your body straight.', 'Push back slowly. Breathe out.'],
      easier: 'Stand a little closer to the wall to make it easier.',
      search: 'NHS wall press up exercise'
    },
    shoulder: {
      name: 'Outward shoulder press', mode: 'holds', reps: 5, seconds: 5, sides: true, target: '5 gentle holds per side · 5 sec each',
      media: media('isometric', 0, { single: true, still: true, caption: 'Hold still · arrow shows pressure' }),
      steps: ['Stand side-on to a wall. Keep your elbow tucked at your waist and bent.', 'Gently press the back of your hand outward into the wall.', 'Hold 5 seconds, then relax. Keep breathing. Do not move the arm.'],
      easier: 'Use gentle pressure. Ask your physio to check the position.',
      search: 'NHS shoulder isometric external rotation wall elbow side'
    },
    squat: {
      name: 'Bodyweight squat', mode: 'reps', reps: 6, target: '6–10 reps',
      media: media('squat', 0, { rows: 1 }),
      steps: ['Stand with feet about shoulder-width apart. Hold a stable counter if needed.', 'Bend your hips and knees. Lower as far as comfortable, keeping heels down and back straight.', 'Your torso can lean forward from the hips. Stand fully back up.'],
      easier: 'The picture shows a lower squat. Use a smaller depth if needed; do not force it or work through pain.',
      search: 'NHS physiotherapy bodyweight squat technique'
    },
    calf: {
      name: 'Supported calf raise', mode: 'reps', reps: 6, target: '6–10 reps',
      media: media('strength', 2),
      steps: ['Stand tall, holding a stable counter.', 'Slowly lift both heels. Keep your toes on the floor.', 'Lower both heels gently. Do not bounce.'],
      search: 'NHS supported calf raise exercise'
    },
    blades: {
      name: 'Shoulder-blade lift', mode: 'reps', reps: 6, target: '6–10 small lifts',
      media: media('shoulders', 1),
      steps: ['Lie face down. Bend your arms into a comfortable W.', 'Gently draw your shoulder blades together. Lift hands and elbows slightly.', 'Keep your chest down and neck long. Lower slowly.'],
      easier: 'Keep the lift very small. Do not arch your lower back.',
      search: 'physiotherapy prone W shoulder blade exercise'
    },
    bridge: {
      name: 'Glute bridge', mode: 'reps', reps: 6, target: '6–10 reps',
      media: media('floor', 2),
      steps: ['Lie on your back. Knees bent, feet flat.', 'Gently tighten your bottom and lift your hips a little.', 'Keep your back comfortable, without arching. Lower slowly.'],
      easier: 'Use a smaller lift. Skip this if it causes back discomfort.',
      search: 'NHS physiotherapy glute bridge exercise'
    },
    sideleg: {
      name: 'Supported side leg raise', mode: 'reps', reps: 6, sides: true, target: '6–10 reps per side',
      media: media('hip', 0, { rows: 1 }),
      steps: ['Stand tall and hold a stable counter beside or in front of you.', 'Move one leg a little out to the side. Keep toes pointing forward.', 'Keep your body upright. Lower slowly, then change sides.'],
      search: 'NHS standing supported hip abduction side leg raise'
    },
    birddog: {
      name: 'Bird dog', mode: 'reps', reps: 10, sides: true, setsBySide: true, target: '10 reps with each arm/leg pair',
      media: media('birddog', 0, { rows: 1 }),
      steps: ['Start on hands and knees. Use the version your physio assigned.', 'Reach one arm and the opposite leg out. Return both slowly to the mat.', 'Do 10 reps with that same pair, then 10 with the other pair. Keep hips level and back still.'],
      easier: 'Keep the reach controlled. Follow any different dose or hold time your physio gives you.',
      search: 'NHS physiotherapy bird dog opposite arm leg exercise'
    },
    walkout: {
      name: 'Easy walk', mode: 'time', seconds: 60, target: '1 easy minute',
      media: media('warmup', 0, { still: true, caption: 'Position guide · take easy steps' }),
      steps: ['Walk slowly around a clear, level space.', 'Let your breathing settle.', 'Use small, comfortable steps.'],
      search: 'NHS walking cool down'
    },
    butterfly: {
      name: 'Gentle butterfly stretch', mode: 'time', seconds: 20, target: '20 seconds · gentle hold',
      media: media('butterfly', 0, { single: true, still: true, caption: 'Position guide · let knees relax; do not press them down' }),
      steps: ['Sit tall on the mat, with the soles of your feet together and knees out.', 'Keep feet a comfortable distance away. Let the knees relax; do not push them down.', 'Hold gently and breathe normally. Release if your back or knees hurt.'],
      easier: 'A folded cushion can support your seat. Do not fold forward or force your knees toward the floor.',
      search: 'physiotherapy gentle seated butterfly stretch'
    },
    hamstring: {
      name: 'Hamstring stretch', mode: 'physio', target: 'Follow your physio’s position and hold time',
      media: media('cooldown', 0, { still: true, caption: 'Example position · follow your physio’s version' }),
      steps: ['Use the hamstring stretch your physio showed you.', 'This picture shows a seated example; your version may differ.', 'Stretch gently. Follow your prescribed hold time and sides.'],
      search: 'NHS physiotherapy gentle hamstring stretch'
    },
    calfstretch: {
      name: 'Calf stretch', mode: 'time', seconds: 20, sides: true, target: '20 seconds per side',
      media: media('cooldown', 1, { still: true }),
      steps: ['Hands on a wall. Put one foot behind you.', 'Keep the back heel down and back knee straight.', 'Bend the front knee a little. Hold a gentle stretch, then change sides.'],
      search: 'NHS standing calf stretch wall'
    },
    shoulderstretch: {
      name: 'Across-chest shoulder stretch', mode: 'time', seconds: 20, sides: true, target: '20 seconds per side',
      media: media('cooldown', 2, { still: true }),
      steps: ['Bring one arm gently across your chest.', 'Support the upper arm with your other hand, above the elbow.', 'Keep your shoulder relaxed. Hold, then change sides.'],
      search: 'NHS across chest shoulder stretch'
    }
  };
  const warmup = ['march', 'rolls', 'ankles', 'catcow', 'pelvic'];
  const cooldown = ['butterfly', 'hamstring', 'calfstretch', 'shoulderstretch'];
  const makeWorkout = (id, title, strength) => ({
    id, title,
    exercises: [['warmup', warmup], ['strength', strength], ['cooldown', cooldown]].flatMap(([phase, ids]) => ids.map(key => ({
      id: key, ...structuredClone(EX[key]), phase,
      sets: phase === 'strength' && EX[key].mode !== 'physio' ? 2 : 1
    })))
  });
  window.DAD_PROGRAM = {
    version: 1,
    // Display guidance applies to existing drafts without changing their saved dose or records.
    countingGuides: {
      march: { label: 'One marching rep', text: 'Lift one knee and foot, then put the foot back down. The other leg is another rep. Here, record seconds rather than reps.' },
      rolls: { label: 'One full rep', text: 'Lift both shoulders, roll them back and down, then return to relaxed shoulders. That is 1 roll. Count each roll in the reverse direction the same way.' },
      ankles: { label: 'One full rep', text: 'Point both feet away, then pull both feet back toward your shins. The whole out-and-back movement is 1 rep.' },
      catcow: { label: 'One full rep', text: 'Gently round your back, then release back to your starting position. That whole cycle is 1 rep. Use your physio’s version and counting method.' },
      pelvic: { label: 'One full rep', text: 'Gently close the gap under your lower back so it meets the mat, then relax. That is 1 rep. Keep your hips down and do not force it.' },
      pushup: { label: 'One full rep', text: 'Bend toward the wall, then push back to the start. In and back out is 1 rep.' },
      shoulder: { label: 'One full hold', text: 'Press gently into the wall for 5 seconds, then fully relax. That is 1 hold on that side. Complete the target on each side separately.' },
      chair: { label: 'One full rep', text: 'Start sitting, stand up, then sit back down slowly. Sitting to standing and back to sitting is 1 rep.' },
      squat: { label: 'One full rep', text: 'Start standing, lower into a squat, then stand fully back up. Down and back up is 1 rep.' },
      calf: { label: 'One full rep', text: 'Lift both heels, then lower both heels to the floor. Up and back down is 1 rep.' },
      blades: { label: 'One full rep', text: 'Lift your hands and elbows slightly, then lower them back to the mat. Up and back down is 1 rep. Keep your chest down.' },
      bridge: { label: 'One full rep', text: 'Lift your hips a little, then lower them back to the mat. Up and back down is 1 rep.' },
      sideleg: { label: 'One full rep', text: 'Lift one leg out to the side, then lower the foot back beside the other foot. Out and back is 1 rep on that side. Count each side separately.' },
      birddog: { label: 'One full rep', text: 'Reach one arm and the opposite leg out, then return both to the mat. That is 1 rep. Follow the side and target shown for this workout.' },
      walkout: { label: 'One walking step', text: 'Move one foot forward and put it down, then step with the other foot. Record your walking time in seconds; you do not need to count steps.' },
      butterfly: { label: 'One full hold', text: 'Settle into a gentle stretch, hold for the target time, then relax out of the position. Record seconds, not reps.' },
      hamstring: { label: 'One full stretch', text: 'Ease into your prescribed stretch, hold for your physio’s time, then release. That is 1 stretch on that side. Follow your physio’s version and counting method.' },
      calfstretch: { label: 'One full hold', text: 'Ease into the stretch, hold for 20 seconds, then release. That is 1 hold on that side. Repeat on the other side. Record seconds for each side.' },
      shoulderstretch: { label: 'One full hold', text: 'Bring one arm across your chest, hold for 20 seconds, then release. That is 1 hold on that side. Repeat with the other arm. Record seconds for each side.' }
    },
    // Presentation-only guides also clarify existing drafts without rewriting saved prescriptions.
    mediaGuides: {
      march: { still: false, labels: ['Both feet on the floor', 'Lift one knee and foot'], caption: 'Lift, lower, then change legs. Keep the steps small.' },
      rolls: { sheet: 'rolls', row: 0, rows: 1, still: false, initialFrame: 0, labels: ['Lift shoulders toward your ears', 'Roll back and relax shoulders down'], caption: 'Keep arms loose. Reverse the roll for the other direction.' },
      pelvic: { sheet: 'pelvic', row: 0, rows: 1, still: false, initialFrame: 0, labels: ['Relaxed · small gap under lower back', 'Gently flatten · lower back meets mat'], caption: 'Close-up shows the lower-back gap closing. Keep your hips on the mat.' },
      squat: { labels: ['Stand tall', 'Lower into a squat · keep back straight'], caption: 'Straight arrow follows your back. Lean from the hips; use a comfortable depth.' },
      birddog: { labels: ['Start on hands and knees', 'Reach opposite arm and leg'], caption: 'Picture shows one pair. Reverse the arm and leg for the other side.' },
      sideleg: { still: false, labels: ['Both feet on the floor', 'Lift leg out to the side'], caption: 'Lift the foot off the floor. Keep toes forward and body upright.' }
    },
    workouts: [
      makeWorkout('a', 'Day A · Upper emphasis', ['pushup', 'shoulder', 'squat', 'calf', 'blades', 'bridge', 'birddog']),
      makeWorkout('b', 'Day B · Lower emphasis', ['squat', 'bridge', 'sideleg', 'calf', 'pushup', 'blades', 'birddog'])
    ]
  };
})();
