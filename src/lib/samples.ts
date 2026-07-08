import type { LangId } from './langs'

export interface CodeSample {
  id: string
  title: string
  lang: LangId
  code: string
}

export const CODE_SAMPLES: CodeSample[] = [
  {
    id: 'fizzbuzz-ts',
    title: 'FizzBuzz (TypeScript)',
    lang: 'ts',
    code: `function fizzBuzz(n: number): string {
  if (n % 15 === 0) return 'FizzBuzz'
  if (n % 3 === 0) return 'Fizz'
  if (n % 5 === 0) return 'Buzz'
  return String(n)
}

function main(): void {
  for (let i = 1; i <= 30; i++) {
    console.log(fizzBuzz(i))
  }
}

main()
`,
  },
  {
    id: 'fibonacci-memo-js',
    title: 'フィボナッチ数列 メモ化 (JavaScript)',
    lang: 'js',
    code: `function createFibonacci() {
  const cache = new Map()

  function fib(n) {
    if (n <= 1) return n
    if (cache.has(n)) return cache.get(n)

    const result = fib(n - 1) + fib(n - 2)
    cache.set(n, result)
    return result
  }

  return fib
}

const fib = createFibonacci()

for (let i = 0; i < 15; i++) {
  console.log(\`fib(\${i}) = \${fib(i)}\`)
}
`,
  },
  {
    id: 'binary-search-py',
    title: '二分探索 (Python)',
    lang: 'py',
    code: `def binary_search(items, target):
    low = 0
    high = len(items) - 1

    while low <= high:
        mid = (low + high) // 2
        value = items[mid]

        if value == target:
            return mid
        elif value < target:
            low = mid + 1
        else:
            high = mid - 1

    return -1


def main():
    items = [1, 3, 5, 7, 9, 11, 13, 15]
    for target in [7, 2, 15]:
        index = binary_search(items, target)
        print(f'target={target} -> index={index}')


if __name__ == '__main__':
    main()
`,
  },
  {
    id: 'quicksort-go',
    title: 'クイックソート (Go)',
    lang: 'go',
    code: `package main

import "fmt"

func quickSort(items []int) []int {
	if len(items) <= 1 {
		return items
	}

	pivot := items[0]
	var less, equal, greater []int

	for _, v := range items {
		switch {
		case v < pivot:
			less = append(less, v)
		case v > pivot:
			greater = append(greater, v)
		default:
			equal = append(equal, v)
		}
	}

	result := quickSort(less)
	result = append(result, equal...)
	result = append(result, quickSort(greater)...)
	return result
}

func main() {
	items := []int{5, 2, 9, 1, 5, 6, 3}
	fmt.Println(quickSort(items))
}
`,
  },
  {
    id: 'point-struct-rs',
    title: '構造体とメソッド (Rust)',
    lang: 'rs',
    code: `struct Point {
    x: f64,
    y: f64,
}

impl Point {
    fn new(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    fn distance(&self, other: &Point) -> f64 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        (dx * dx + dy * dy).sqrt()
    }
}

fn main() {
    let origin = Point::new(0.0, 0.0);
    let target = Point::new(3.0, 4.0);

    let d = origin.distance(&target);
    println!("distance = {}", d);
}
`,
  },
  {
    id: 'reverse-string-c',
    title: '文字列反転 (C)',
    lang: 'c',
    code: `#include <stdio.h>
#include <string.h>

void reverse(char *str) {
    int left = 0;
    int right = (int)strlen(str) - 1;

    while (left < right) {
        char tmp = str[left];
        str[left] = str[right];
        str[right] = tmp;
        left++;
        right--;
    }
}

int main(void) {
    char text[] = "Hello, Shakyo!";

    reverse(text);
    printf("%s\\n", text);

    return 0;
}
`,
  },
]
