# typed: false
# frozen_string_literal: true

# Homebrew formula for adev — autonomous-dev-agent
#
# KR: adev CLI를 Homebrew로 설치하는 formula.
#     Bun 런타임이 필요하며 의존성으로 자동 설치된다.
# EN: Homebrew formula for installing the adev CLI.
#     Requires Bun runtime, automatically installed as a dependency.
#
# 설치 / Install:
#   brew install anthropics/adev/claude-dev-agent
class AutonomousDevAgent < Formula
  desc "Autonomous development agent powered by Claude — adev CLI"
  homepage "https://github.com/anthropics/autonomous-dev-agent"
  version "0.1.0"

  # KR: 배포 tarball URL (실제 릴리즈 시 SHA256 업데이트 필요)
  # EN: Distribution tarball URL (update SHA256 on real releases)
  url "https://github.com/anthropics/autonomous-dev-agent/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "MIT"
  head "https://github.com/anthropics/autonomous-dev-agent.git", branch: "main"

  # WHY: Bun은 TypeScript 소스를 직접 실행하는 런타임 — Node.js 불필요
  depends_on "oven-sh/bun/bun" => :build

  def install
    # 의존성 설치 / Install dependencies
    system "bun", "install", "--frozen-lockfile"

    # 단일 바이너리로 빌드 / Build single binary
    system "bun", "build",
      "src/index.ts",
      "--outfile", "adev",
      "--target", "bun",
      "--compile"

    bin.install "adev"

    # 자동완성 설치 / Install shell completions
    # generate_completions_from_executable(bin/"adev", "completions")
  end

  def post_install
    # 글로벌 설정 디렉토리 생성 / Create global config directory
    (Dir.home + "/.adev").mkpath
  end

  test do
    # KR: 버전 출력 확인 / EN: Verify version output
    assert_match version.to_s, shell_output("#{bin}/adev --version")
  end
end
