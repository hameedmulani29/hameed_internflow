const CONNECTIONS = [
  'M 24 122 C 145 38, 228 52, 344 116 S 560 180, 690 92',
  'M 690 92 C 802 26, 930 56, 1018 138 S 1150 194, 1260 116',
  'M 102 618 C 210 538, 330 556, 420 638 S 620 720, 742 632',
  'M 742 632 C 860 548, 946 520, 1088 598 S 1190 666, 1270 586',
  'M 182 286 C 292 224, 344 250, 428 328 S 584 430, 704 348',
  'M 704 348 C 828 266, 918 302, 1000 374',
  'M 420 638 C 452 516, 448 414, 428 328',
  'M 1018 138 C 978 246, 990 304, 1000 374',
];

const NODES = [
  [24, 122, 'node-a'], [344, 116, 'node-b'], [690, 92, 'node-c'], [1018, 138, 'node-d'],
  [1260, 116, 'node-e'], [102, 618, 'node-f'], [420, 638, 'node-g'], [742, 632, 'node-h'],
  [1088, 598, 'node-i'], [182, 286, 'node-j'], [428, 328, 'node-k'], [704, 348, 'node-l'], [1000, 374, 'node-m'],
];

export default function MentorBackground() {
  return (
    <div className="mentor-background" aria-hidden="true">
      <div className="mentor-background-wash mentor-background-wash-a" />
      <div className="mentor-background-wash mentor-background-wash-b" />
      <div className="mentor-background-wash mentor-background-wash-c" />
      <div className="mentor-background-grid mentor-background-grid-a" />
      <div className="mentor-background-grid mentor-background-grid-b" />
      <svg className="mentor-connection-map" viewBox="0 0 1280 760" preserveAspectRatio="none">
        <g className="mentor-connection-lines">
          {CONNECTIONS.map((path, index) => <path key={path} d={path} style={{ '--connection-delay': `${index * 0.8}s` }} />)}
        </g>
        <g className="mentor-connection-nodes">
          {NODES.map(([cx, cy, name], index) => <circle key={name} className={name} cx={cx} cy={cy} r={index % 4 === 0 ? 5 : 3.5} style={{ '--node-delay': `${index * 0.45}s` }} />)}
        </g>
        <g className="mentor-connection-orbits">
          <ellipse cx="344" cy="116" rx="82" ry="36" />
          <ellipse cx="1088" cy="598" rx="112" ry="46" />
          <ellipse cx="428" cy="328" rx="62" ry="26" />
        </g>
      </svg>
      <span className="mentor-background-light mentor-background-light-a" />
      <span className="mentor-background-light mentor-background-light-b" />
    </div>
  );
}
