export const PROBLEMS = [
  {
    title: "두 수의 합", difficulty: "입문", tags: ["입출력", "산술 연산"],
    description: "정수 두 개가 주어집니다. 두 수를 더한 값을 출력하는 프로그램을 작성하세요.",
    input: "한 줄에 정수 A와 B가 공백으로 구분되어 주어집니다. (-1,000 ≤ A, B ≤ 1,000)", output: "A와 B의 합을 출력합니다.", hint: "input().split()으로 입력을 나누고, int()로 숫자로 바꿔 보세요.",
    sampleInput: "3 5", sampleOutput: "8", starter: "a, b = map(int, input().split())\n\n# 두 수의 합을 출력하세요\n", answer: "a, b = map(int, input().split())\nprint(a + b)\n",
    tests: [["1 2", "3"], ["-7 4", "-3"], ["120 880", "1000"], ["0 0", "0"]]
  },
  {
    title: "짝수일까 홀수일까", difficulty: "입문", tags: ["조건문", "나머지 연산"],
    description: "정수 N이 주어집니다. N이 짝수라면 Even, 홀수라면 Odd를 출력하세요.",
    input: "첫째 줄에 정수 N이 주어집니다. (1 ≤ N ≤ 1,000,000)", output: "짝수이면 Even, 홀수이면 Odd를 출력합니다.", hint: "어떤 수를 2로 나눈 나머지가 0이면 짝수입니다.",
    sampleInput: "14", sampleOutput: "Even", starter: "n = int(input())\n\n# 짝수인지 홀수인지 판별하세요\n", answer: "n = int(input())\nif n % 2 == 0:\n    print(\"Even\")\nelse:\n    print(\"Odd\")\n",
    tests: [["2", "Even"], ["7", "Odd"], ["1000000", "Even"], ["999999", "Odd"]]
  },
  {
    title: "세 수 중 가장 큰 수", difficulty: "입문", tags: ["리스트", "최댓값"],
    description: "서로 다른 세 정수가 주어집니다. 세 수 중 가장 큰 수를 출력하세요.",
    input: "한 줄에 세 정수가 공백으로 구분되어 주어집니다. (-10,000 ≤ 수 ≤ 10,000)", output: "가장 큰 정수 하나를 출력합니다.", hint: "max() 함수에 숫자 세 개를 넣거나, 리스트에서 최댓값을 찾아 보세요.",
    sampleInput: "12 4 19", sampleOutput: "19", starter: "numbers = list(map(int, input().split()))\n\n# 가장 큰 수를 출력하세요\n", answer: "numbers = list(map(int, input().split()))\nprint(max(numbers))\n",
    tests: [["12 4 19", "19"], ["-8 -2 -15", "-2"], ["5 30 20", "30"], ["10000 0 9999", "10000"]]
  },
  {
    title: "구구단 출력하기", difficulty: "초급", tags: ["반복문", "문자열"],
    description: "정수 N이 주어집니다. N단의 구구단을 1부터 9까지 차례대로 출력하세요. 각 줄은 'N x i = 결과' 형식이어야 합니다.",
    input: "첫째 줄에 정수 N이 주어집니다. (2 ≤ N ≤ 9)", output: "N x 1 = 결과부터 N x 9 = 결과까지 아홉 줄을 출력합니다. x 앞뒤에는 공백을 둡니다.", hint: "for i in range(1, 10): 으로 1부터 9까지 반복할 수 있어요.",
    sampleInput: "3", sampleOutput: "3 x 1 = 3\n3 x 2 = 6\n3 x 3 = 9\n3 x 4 = 12\n3 x 5 = 15\n3 x 6 = 18\n3 x 7 = 21\n3 x 8 = 24\n3 x 9 = 27", starter: "n = int(input())\n\n# 구구단을 출력하세요\n", answer: "n = int(input())\nfor i in range(1, 10):\n    print(f\"{n} x {i} = {n * i}\")\n",
    tests: [["2", "2 x 1 = 2\n2 x 2 = 4\n2 x 3 = 6\n2 x 4 = 8\n2 x 5 = 10\n2 x 6 = 12\n2 x 7 = 14\n2 x 8 = 16\n2 x 9 = 18"], ["5", "5 x 1 = 5\n5 x 2 = 10\n5 x 3 = 15\n5 x 4 = 20\n5 x 5 = 25\n5 x 6 = 30\n5 x 7 = 35\n5 x 8 = 40\n5 x 9 = 45"], ["9", "9 x 1 = 9\n9 x 2 = 18\n9 x 3 = 27\n9 x 4 = 36\n9 x 5 = 45\n9 x 6 = 54\n9 x 7 = 63\n9 x 8 = 72\n9 x 9 = 81"]]
  },
  {
    title: "거꾸로 읽기", difficulty: "초급", tags: ["문자열", "슬라이싱"],
    description: "영문 소문자로 이루어진 단어가 주어집니다. 단어를 거꾸로 뒤집어 출력하세요.",
    input: "첫째 줄에 길이 1 이상 100 이하의 영문 소문자 단어가 주어집니다.", output: "입력된 단어를 뒤집은 결과를 출력합니다.", hint: "문자열 뒤에 [::-1]을 붙이면 순서를 뒤집을 수 있어요.",
    sampleInput: "python", sampleOutput: "nohtyp", starter: "word = input()\n\n# 단어를 거꾸로 출력하세요\n", answer: "word = input()\nprint(word[::-1])\n",
    tests: [["python", "nohtyp"], ["a", "a"], ["coding", "gnidoc"], ["abcde", "edcba"]]
  },
  {
    title: "점수의 평균", difficulty: "초급", tags: ["리스트", "반복문"],
    description: "학생 N명의 점수가 주어집니다. 점수의 평균을 소수점 아래 둘째 자리까지 출력하세요.",
    input: "첫째 줄에 학생 수 N이 주어집니다. 둘째 줄에 N개의 점수가 공백으로 구분되어 주어집니다. (1 ≤ N ≤ 100, 0 ≤ 점수 ≤ 100)", output: "평균을 소수점 아래 둘째 자리까지 출력합니다.", hint: "sum(점수 목록) / 학생 수로 평균을 구하고, f-string으로 소수 자릿수를 정해 보세요.",
    sampleInput: "4\n80 90 100 70", sampleOutput: "85.00", starter: "n = int(input())\nscores = list(map(int, input().split()))\n\n# 평균을 소수점 둘째 자리까지 출력하세요\n", answer: "n = int(input())\nscores = list(map(int, input().split()))\naverage = sum(scores) / n\nprint(f\"{average:.2f}\")\n",
    tests: [["4\n80 90 100 70", "85.00"], ["3\n0 0 0", "0.00"], ["1\n77", "77.00"], ["5\n100 99 98 97 96", "98.00"]]
  },
  {
    title: "별 계단", difficulty: "초급", tags: ["반복문", "문자열"],
    description: "정수 N이 주어집니다. 첫째 줄에는 별 한 개, 둘째 줄에는 별 두 개처럼 N번째 줄까지 별 계단을 출력하세요.",
    input: "첫째 줄에 정수 N이 주어집니다. (1 ≤ N ≤ 20)", output: "i번째 줄에 별 문자 *를 i개 출력합니다.", hint: "문자열 '*'에 숫자를 곱하면 별을 여러 개 만들 수 있어요.",
    sampleInput: "4", sampleOutput: "*\n**\n***\n****", starter: "n = int(input())\n\n# 별 계단을 출력하세요\n", answer: "n = int(input())\nfor i in range(1, n + 1):\n    print(\"*\" * i)\n",
    tests: [["1", "*"], ["4", "*\n**\n***\n****"], ["6", "*\n**\n***\n****\n*****\n******"], ["2", "*\n**"]]
  },
  {
    title: "모음 세기", difficulty: "초급", tags: ["문자열", "조건문"],
    description: "영문 소문자로 이루어진 문장이 주어집니다. 문장에 들어 있는 모음(a, e, i, o, u)의 개수를 세어 출력하세요.",
    input: "첫째 줄에 공백이 없는 영문 소문자 문자열이 주어집니다. (길이 1 이상 1,000 이하)", output: "모음의 개수를 정수로 출력합니다.", hint: "문자 하나씩 확인하면서 'aeiou' 안에 있는지 검사해 보세요.",
    sampleInput: "education", sampleOutput: "5", starter: "text = input()\n\n# 모음의 개수를 세어 출력하세요\n", answer: "text = input()\nvowels = \"aeiou\"\ncount = sum(1 for char in text if char in vowels)\nprint(count)\n",
    tests: [["education", "5"], ["rhythm", "0"], ["aeiou", "5"], ["beautiful", "5"]]
  },
  {
    title: "숫자 거꾸로 더하기", difficulty: "초급", tags: ["문자열", "정수 변환"],
    description: "양의 정수 N이 주어집니다. N의 숫자 순서를 거꾸로 바꾼 뒤, 원래 수와 더한 값을 출력하세요. 뒤집은 수의 맨 앞에 오는 0은 자연스럽게 제외합니다.",
    input: "첫째 줄에 양의 정수 N이 주어집니다. (1 ≤ N ≤ 1,000,000)", output: "N과 뒤집은 수의 합을 출력합니다.", hint: "숫자를 문자열로 바꿔 뒤집고 다시 int()로 바꾸면 맨 앞의 0도 처리돼요.",
    sampleInput: "123", sampleOutput: "444", starter: "n = input()\n\n# 숫자를 뒤집어 원래 수와 더하세요\n", answer: "n = input()\nreversed_number = int(n[::-1])\nprint(int(n) + reversed_number)\n",
    tests: [["123", "444"], ["120", "141"], ["7", "14"], ["1001", "2002"]]
  },
  {
    title: "가장 긴 단어", difficulty: "초급", tags: ["문자열", "리스트"],
    description: "공백으로 구분된 여러 단어가 주어집니다. 가장 긴 단어의 길이를 출력하세요. 가장 긴 단어가 여러 개여도 길이만 출력하면 됩니다.",
    input: "첫째 줄에 영문 소문자 단어들이 공백으로 구분되어 주어집니다. 단어는 최대 20개이며, 각 단어의 길이는 1 이상 50 이하입니다.", output: "가장 긴 단어의 글자 수를 출력합니다.", hint: "split()으로 단어를 나누고, 각 단어의 len()을 비교해 보세요.",
    sampleInput: "cat programming code", sampleOutput: "11", starter: "words = input().split()\n\n# 가장 긴 단어의 길이를 출력하세요\n", answer: "words = input().split()\nprint(max(len(word) for word in words))\n",
    tests: [["cat programming code", "11"], ["hi to me", "2"], ["abcdefgh", "8"], ["one three seven", "5"]]
  }
];
