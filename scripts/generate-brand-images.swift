import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let publicDirectory = root.appendingPathComponent("public", isDirectory: true)

func image(named name: String) -> NSImage {
  let url = publicDirectory.appendingPathComponent(name)
  guard let image = NSImage(contentsOf: url) else {
    fatalError("이미지를 열 수 없습니다: \(url.path)")
  }
  return image
}

func bitmap(width: Int, height: Int, drawing: () -> Void) -> NSBitmapImageRep {
  guard let representation = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ), let context = NSGraphicsContext(bitmapImageRep: representation) else {
    fatalError("비트맵 컨텍스트를 만들 수 없습니다.")
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.imageInterpolation = .high
  drawing()
  context.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()
  return representation
}

func writePNG(_ representation: NSBitmapImageRep, named name: String) {
  guard let data = representation.representation(using: .png, properties: [:]) else {
    fatalError("PNG 데이터를 만들 수 없습니다: \(name)")
  }
  try! data.write(to: publicDirectory.appendingPathComponent(name), options: .atomic)
}

func drawAspectFill(_ source: NSImage, in destination: NSRect) {
  let sourceSize = source.size
  let sourceRatio = sourceSize.width / sourceSize.height
  let destinationRatio = destination.width / destination.height
  var crop = NSRect(origin: .zero, size: sourceSize)

  if sourceRatio > destinationRatio {
    let width = sourceSize.height * destinationRatio
    crop.origin.x = (sourceSize.width - width) / 2
    crop.size.width = width
  } else {
    let height = sourceSize.width / destinationRatio
    crop.origin.y = (sourceSize.height - height) / 2
    crop.size.height = height
  }

  source.draw(in: destination, from: crop, operation: .sourceOver, fraction: 1)
}

func font(size: CGFloat, weight: NSFont.Weight) -> NSFont {
  NSFont(name: "AppleSDGothicNeo-Bold", size: size)
    ?? NSFont.systemFont(ofSize: size, weight: weight)
}

let background = image(named: "server-room-v2-main.jpg")
let logo = image(named: "cyber-quest-lock-logo.png")

let social = bitmap(width: 1200, height: 630) {
  let canvas = NSRect(x: 0, y: 0, width: 1200, height: 630)
  drawAspectFill(background, in: canvas)

  NSColor(calibratedWhite: 0, alpha: 0.46).setFill()
  canvas.fill()

  NSGradient(colorsAndLocations:
    (NSColor(calibratedRed: 0.01, green: 0.04, blue: 0.10, alpha: 0.96), 0),
    (NSColor(calibratedRed: 0.01, green: 0.04, blue: 0.10, alpha: 0.72), 0.54),
    (NSColor(calibratedRed: 0.01, green: 0.04, blue: 0.10, alpha: 0.18), 1)
  )?.draw(in: canvas, angle: 0)

  NSColor(calibratedRed: 0.18, green: 0.49, blue: 0.95, alpha: 0.95).setFill()
  NSRect(x: 68, y: 65, width: 8, height: 500).fill()

  logo.draw(
    in: NSRect(x: 108, y: 246, width: 500, height: 333),
    from: .zero,
    operation: .sourceOver,
    fraction: 1
  )

  let title = NSAttributedString(
    string: "정보보안 방탈출",
    attributes: [
      .font: font(size: 52, weight: .heavy),
      .foregroundColor: NSColor.white,
      .kern: -1.2,
    ]
  )
  title.draw(at: NSPoint(x: 112, y: 165))

  let subtitle = NSAttributedString(
    string: "보안 문제를 해결하고 잠긴 서버실을 탈출하세요",
    attributes: [
      .font: font(size: 25, weight: .semibold),
      .foregroundColor: NSColor(calibratedRed: 0.75, green: 0.84, blue: 0.96, alpha: 1),
      .kern: -0.3,
    ]
  )
  subtitle.draw(at: NSPoint(x: 112, y: 112))

  NSColor(calibratedRed: 0.22, green: 0.54, blue: 1, alpha: 0.9).setFill()
  NSRect(x: 111, y: 82, width: 168, height: 4).fill()
}
writePNG(social, named: "social-preview.png")

func createAppIcon(size: Int, named name: String) {
  let icon = bitmap(width: size, height: size) {
    let edge = CGFloat(size)
    let canvas = NSRect(x: 0, y: 0, width: edge, height: edge)
    let radius = edge * 0.22
    let shape = NSBezierPath(roundedRect: canvas, xRadius: radius, yRadius: radius)
    NSGradient(colors: [
      NSColor(calibratedRed: 0.05, green: 0.20, blue: 0.43, alpha: 1),
      NSColor(calibratedRed: 0.01, green: 0.06, blue: 0.15, alpha: 1),
    ])?.draw(in: shape, angle: -90)

    NSColor(calibratedRed: 0.36, green: 0.70, blue: 1, alpha: 1).setStroke()
    shape.lineWidth = max(2, edge * 0.022)
    shape.stroke()

    let logoWidth = edge * 0.84
    let logoHeight = logoWidth * 2 / 3
    logo.draw(
      in: NSRect(
        x: (edge - logoWidth) / 2,
        y: (edge - logoHeight) / 2,
        width: logoWidth,
        height: logoHeight
      ),
      from: .zero,
      operation: .sourceOver,
      fraction: 1
    )
  }
  writePNG(icon, named: name)
}

createAppIcon(size: 180, named: "apple-touch-icon.png")
createAppIcon(size: 512, named: "app-icon-512.png")
